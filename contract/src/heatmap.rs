//! Attendee heatmap for venue layouts (Issue #1499).
//!
//! Gate and floor scanners report where attendees are standing as `(x, y)`
//! positions on the venue map. [`aggregate_scan_positions`] folds a batch of
//! those positions into a coarse grid of tiles, [`generate_heatmap_tiles`]
//! returns the grid as density overlay tiles for the interactive map, and
//! [`stream_heatmap_updates`] returns only the tiles that changed after a
//! sequence number so a client can keep the overlay live without refetching
//! the whole grid.
//!
//! Every aggregation advances a per-event sequence number and stamps it on the
//! tiles it touched. That sequence is the cursor a streaming client carries
//! between polls, and it is also published with each aggregation event so a
//! subscriber knows when to poll.

use crate::error::LumentixError;
use crate::events::{HeatmapCongestionDetected, HeatmapConfigured, ScanPositionsAggregated};
use crate::types::PERSISTENT_LIFETIME;
use soroban_sdk::{Env, Map, Symbol, Vec};

/// Largest grid edge, in tiles. Bounds the size of the stored tile map.
pub const MAX_GRID_DIMENSION: u32 = 32;

/// Most positions accepted by a single aggregation call.
pub const MAX_SCAN_BATCH: u32 = 100;

/// Density level of a tile nobody is standing in.
pub const DENSITY_EMPTY: u32 = 0;
/// Density level reached at a tile at or past its congestion threshold.
pub const DENSITY_CONGESTED: u32 = 4;

/// A single attendee position reported by a scanner, in venue-map units.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct ScanPosition {
    pub x: u32,
    pub y: u32,
}

/// Grid layout and congestion settings for an event's heatmap.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct HeatmapConfig {
    pub event_id: u64,
    /// Edge length of one square tile, in venue-map units.
    pub tile_size: u32,
    /// Grid width in tiles.
    pub grid_width: u32,
    /// Grid height in tiles.
    pub grid_height: u32,
    /// Attendees in one tile at which the tile counts as congested.
    pub congestion_threshold: u32,
    /// Sequence number of the latest aggregation; 0 before any.
    pub sequence: u64,
    /// Ledger timestamp of the most recent configuration.
    pub configured_at: u64,
}

/// One cell of the density overlay.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct HeatmapTile {
    pub tile_x: u32,
    pub tile_y: u32,
    /// Attendees counted in the tile.
    pub count: u32,
    /// 0 (empty) through 4 (congested).
    pub density_level: u32,
    /// Sequence of the aggregation that last changed the tile.
    pub updated_seq: u64,
}

/// The tiles that changed between two sequence numbers.
#[derive(Clone, Debug, Eq, PartialEq)]
#[soroban_sdk::contracttype]
pub struct HeatmapUpdate {
    pub event_id: u64,
    /// The cursor the caller passed in.
    pub from_sequence: u64,
    /// The latest sequence; pass this back as the next cursor.
    pub to_sequence: u64,
    /// Tiles changed after `from_sequence`.
    pub tiles: Vec<HeatmapTile>,
    /// Congested tiles among `tiles`.
    pub congested_tiles: u32,
}

// ──────────────────────────── Storage keys ──────────────────────────────────

/// key: (Symbol("heatmap_cfg"), event_id: u64)
fn config_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "heatmap_cfg"), event_id)
}

/// key: (Symbol("heatmap_tiles"), event_id: u64)
fn tiles_key(env: &Env, event_id: u64) -> (Symbol, u64) {
    (Symbol::new(env, "heatmap_tiles"), event_id)
}

fn store_config(env: &Env, config: &HeatmapConfig) {
    let key = config_key(env, config.event_id);
    env.storage().persistent().set(&key, config);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

fn load_tiles(env: &Env, event_id: u64) -> Map<u32, HeatmapTile> {
    env.storage()
        .persistent()
        .get(&tiles_key(env, event_id))
        .unwrap_or_else(|| Map::new(env))
}

fn store_tiles(env: &Env, event_id: u64, tiles: &Map<u32, HeatmapTile>) {
    let key = tiles_key(env, event_id);
    env.storage().persistent().set(&key, tiles);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_LIFETIME, PERSISTENT_LIFETIME);
}

// ──────────────────────────── Helpers ───────────────────────────────────────

/// Bucket a tile's headcount against its congestion threshold.
fn density_level(count: u32, threshold: u32) -> u32 {
    if count == 0 {
        return DENSITY_EMPTY;
    }
    let percent = u64::from(count) * 100 / u64::from(threshold);
    if percent < 34 {
        1
    } else if percent < 67 {
        2
    } else if percent < 100 {
        3
    } else {
        DENSITY_CONGESTED
    }
}

// ──────────────────────────── Public interface ───────────────────────────────

/// Configure (or reconfigure) the heatmap grid for `event_id`.
///
/// Reconfiguring changes what a tile index means, so it clears the stored
/// tiles. The sequence keeps counting up, and clients should refetch with
/// [`generate_heatmap_tiles`] afterwards.
///
/// Fails with `InvalidHeatmapConfig` for a zero tile size, threshold or grid
/// edge, or a grid edge above [`MAX_GRID_DIMENSION`].
pub fn configure_heatmap(
    env: &Env,
    event_id: u64,
    tile_size: u32,
    grid_width: u32,
    grid_height: u32,
    congestion_threshold: u32,
) -> Result<HeatmapConfig, LumentixError> {
    if tile_size == 0
        || congestion_threshold == 0
        || grid_width == 0
        || grid_height == 0
        || grid_width > MAX_GRID_DIMENSION
        || grid_height > MAX_GRID_DIMENSION
    {
        return Err(LumentixError::InvalidHeatmapConfig);
    }

    let sequence = try_get_heatmap_config(env, event_id)
        .map(|existing| existing.sequence.saturating_add(1))
        .unwrap_or(0);

    let config = HeatmapConfig {
        event_id,
        tile_size,
        grid_width,
        grid_height,
        congestion_threshold,
        sequence,
        configured_at: env.ledger().timestamp(),
    };

    store_config(env, &config);
    store_tiles(env, event_id, &Map::new(env));
    HeatmapConfigured::emit(env, event_id, grid_width, grid_height, tile_size);

    Ok(config)
}

/// Return the heatmap configuration for `event_id`, or `None` when unset.
pub fn try_get_heatmap_config(env: &Env, event_id: u64) -> Option<HeatmapConfig> {
    env.storage().persistent().get(&config_key(env, event_id))
}

/// Return the heatmap configuration for `event_id`.
///
/// Fails with `HeatmapNotConfigured` when the organizer has not set one.
pub fn get_heatmap_config(env: &Env, event_id: u64) -> Result<HeatmapConfig, LumentixError> {
    try_get_heatmap_config(env, event_id).ok_or(LumentixError::HeatmapNotConfigured)
}

/// Fold a batch of scanner positions into the event's tile grid and return the
/// new sequence number.
///
/// With `reset` false the batch is added to the running counts. With `reset`
/// true the batch is a full snapshot of where attendees are right now: it
/// replaces the counts, and tiles it does not mention drop to empty. Snapshot
/// mode is what keeps the overlay showing live density rather than a running
/// total of everyone who ever walked past.
///
/// Fails with `HeatmapNotConfigured` before [`configure_heatmap`],
/// `InvalidScanBatch` for an empty batch or one above [`MAX_SCAN_BATCH`], and
/// `ScanPositionOutOfBounds` when any position falls outside the grid. A
/// failed call changes nothing.
pub fn aggregate_scan_positions(
    env: &Env,
    event_id: u64,
    positions: Vec<ScanPosition>,
    reset: bool,
) -> Result<u64, LumentixError> {
    let mut config = get_heatmap_config(env, event_id)?;

    if positions.is_empty() || positions.len() > MAX_SCAN_BATCH {
        return Err(LumentixError::InvalidScanBatch);
    }

    // Bucket the batch first so a bad position rejects it before any write.
    let mut batch_counts: Map<u32, u32> = Map::new(env);
    for position in positions.iter() {
        let tile_x = position.x / config.tile_size;
        let tile_y = position.y / config.tile_size;
        if tile_x >= config.grid_width || tile_y >= config.grid_height {
            return Err(LumentixError::ScanPositionOutOfBounds);
        }
        let index = tile_y * config.grid_width + tile_x;
        let seen = batch_counts.get(index).unwrap_or(0);
        batch_counts.set(index, seen + 1);
    }

    let sequence = config.sequence.saturating_add(1);
    let mut tiles = load_tiles(env, event_id);

    if reset {
        for (index, tile) in tiles.clone().iter() {
            if tile.count > 0 && !batch_counts.contains_key(index) {
                tiles.set(
                    index,
                    HeatmapTile {
                        count: 0,
                        density_level: DENSITY_EMPTY,
                        updated_seq: sequence,
                        ..tile
                    },
                );
            }
        }
    }

    for (index, added) in batch_counts.iter() {
        let previous = tiles.get(index);
        let previous_level = previous
            .as_ref()
            .map(|tile| tile.density_level)
            .unwrap_or(DENSITY_EMPTY);
        let previous_count = previous.map(|tile| tile.count).unwrap_or(0);

        let count = if reset {
            added
        } else {
            previous_count.saturating_add(added)
        };
        let level = density_level(count, config.congestion_threshold);
        let tile_x = index % config.grid_width;
        let tile_y = index / config.grid_width;

        tiles.set(
            index,
            HeatmapTile {
                tile_x,
                tile_y,
                count,
                density_level: level,
                updated_seq: sequence,
            },
        );

        // Announce a tile only on the way into congestion, not on every
        // batch that finds it still crowded.
        if level == DENSITY_CONGESTED && previous_level != DENSITY_CONGESTED {
            HeatmapCongestionDetected::emit(env, event_id, tile_x, tile_y, count);
        }
    }

    config.sequence = sequence;
    store_config(env, &config);
    store_tiles(env, event_id, &tiles);
    ScanPositionsAggregated::emit(env, event_id, sequence, positions.len(), batch_counts.len());

    Ok(sequence)
}

/// Return every occupied tile for the event's density overlay, ordered by tile
/// index (row by row).
///
/// Fails with `HeatmapNotConfigured` before [`configure_heatmap`].
pub fn generate_heatmap_tiles(env: &Env, event_id: u64) -> Result<Vec<HeatmapTile>, LumentixError> {
    get_heatmap_config(env, event_id)?;

    let mut overlay = Vec::new(env);
    for (_, tile) in load_tiles(env, event_id).iter() {
        if tile.count > 0 {
            overlay.push_back(tile);
        }
    }
    Ok(overlay)
}

/// Return the tiles that changed after `since_sequence`.
///
/// A client starts at sequence 0 for the full picture, then passes the
/// returned `to_sequence` back on each poll. Tiles that emptied out are
/// included with a zero count so the client can clear them.
///
/// Fails with `HeatmapNotConfigured` before [`configure_heatmap`].
pub fn stream_heatmap_updates(
    env: &Env,
    event_id: u64,
    since_sequence: u64,
) -> Result<HeatmapUpdate, LumentixError> {
    let config = get_heatmap_config(env, event_id)?;

    let mut changed = Vec::new(env);
    let mut congested_tiles = 0u32;
    for (_, tile) in load_tiles(env, event_id).iter() {
        if tile.updated_seq > since_sequence {
            if tile.density_level == DENSITY_CONGESTED {
                congested_tiles += 1;
            }
            changed.push_back(tile);
        }
    }

    Ok(HeatmapUpdate {
        event_id,
        from_sequence: since_sequence,
        to_sequence: config.sequence,
        tiles: changed,
        congested_tiles,
    })
}
