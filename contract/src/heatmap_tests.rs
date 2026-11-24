#![allow(warnings)]
//! Tests for the attendee heatmap (#1499):
//! `aggregate_scan_positions`, `generate_heatmap_tiles`, `stream_heatmap_updates`.

use crate::error::LumentixError;
use crate::heatmap::ScanPosition;
use crate::lumentix_contract::{LumentixContract, LumentixContractClient};
use crate::types::EventStatus;
use soroban_sdk::{testutils::Address as _, Address, Env, String, Vec};

fn setup(env: &Env) -> LumentixContractClient<'_> {
    env.mock_all_auths();
    let contract_id = env.register(LumentixContract, ());
    let client = LumentixContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    client.initialize(&admin);
    client
}

fn publish_event(env: &Env, client: &LumentixContractClient, organizer: &Address) -> u64 {
    let now = env.ledger().timestamp();
    let event_id = client.create_event(
        organizer,
        &String::from_str(env, "Heatmap Event"),
        &String::from_str(env, "Desc"),
        &String::from_str(env, "Venue"),
        &(now + 1_000),
        &(now + 2_000),
        &100i128,
        &50u32,
    );
    client.update_event_status(&event_id, &EventStatus::Published, organizer);
    event_id
}

fn positions(env: &Env, points: &[(u32, u32)]) -> Vec<ScanPosition> {
    let mut list = Vec::new(env);
    for (x, y) in points {
        list.push_back(ScanPosition { x: *x, y: *y });
    }
    list
}

/// 10-unit tiles on a 4x4 grid; a tile is congested at 4 attendees.
fn configured(env: &Env) -> (LumentixContractClient<'_>, Address, u64) {
    let client = setup(env);
    let organizer = Address::generate(env);
    let event_id = publish_event(env, &client, &organizer);
    client.configure_heatmap(&organizer, &event_id, &10u32, &4u32, &4u32, &4u32);
    (client, organizer, event_id)
}

#[test]
fn heatmap_requires_configuration() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);

    let result = client.try_generate_heatmap_tiles(&event_id);
    assert_eq!(result, Err(Ok(LumentixError::HeatmapNotConfigured)));

    let result = client.try_aggregate_scan_positions(
        &organizer,
        &event_id,
        &positions(&env, &[(1, 1)]),
        &false,
    );
    assert_eq!(result, Err(Ok(LumentixError::HeatmapNotConfigured)));
}

#[test]
fn configure_heatmap_rejects_bad_grids_and_strangers() {
    let env = Env::default();
    let client = setup(&env);
    let organizer = Address::generate(&env);
    let stranger = Address::generate(&env);
    let event_id = publish_event(&env, &client, &organizer);

    let result = client.try_configure_heatmap(&organizer, &event_id, &0u32, &4u32, &4u32, &4u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidHeatmapConfig)));
    let result = client.try_configure_heatmap(&organizer, &event_id, &10u32, &33u32, &4u32, &4u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidHeatmapConfig)));
    let result = client.try_configure_heatmap(&organizer, &event_id, &10u32, &4u32, &4u32, &0u32);
    assert_eq!(result, Err(Ok(LumentixError::InvalidHeatmapConfig)));

    let result = client.try_configure_heatmap(&stranger, &event_id, &10u32, &4u32, &4u32, &4u32);
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn aggregate_buckets_positions_into_tiles() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    // Two attendees in tile (0,0), one in tile (2,1).
    let seq = client.aggregate_scan_positions(
        &organizer,
        &event_id,
        &positions(&env, &[(1, 1), (9, 9), (25, 15)]),
        &false,
    );
    assert_eq!(seq, 1);

    let tiles = client.generate_heatmap_tiles(&event_id);
    assert_eq!(tiles.len(), 2);

    let first = tiles.get(0).unwrap();
    assert_eq!((first.tile_x, first.tile_y, first.count), (0, 0, 2));
    // 2 of 4 is 50% of the threshold.
    assert_eq!(first.density_level, 2);

    let second = tiles.get(1).unwrap();
    assert_eq!((second.tile_x, second.tile_y, second.count), (2, 1, 1));
    assert_eq!(second.density_level, 1);
}

#[test]
fn aggregate_accumulates_unless_reset() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(1, 1), (2, 2)]), &false);
    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(3, 3)]), &false);
    let tiles = client.generate_heatmap_tiles(&event_id);
    assert_eq!(tiles.get(0).unwrap().count, 3);

    // A snapshot replaces the counts and empties tiles it does not mention.
    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(35, 35)]), &true);
    let tiles = client.generate_heatmap_tiles(&event_id);
    assert_eq!(tiles.len(), 1);
    let only = tiles.get(0).unwrap();
    assert_eq!((only.tile_x, only.tile_y, only.count), (3, 3, 1));
}

#[test]
fn congested_tiles_reach_top_density_level() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    client.aggregate_scan_positions(
        &organizer,
        &event_id,
        &positions(&env, &[(1, 1), (2, 2), (3, 3), (4, 4)]),
        &false,
    );
    let tiles = client.generate_heatmap_tiles(&event_id);
    assert_eq!(tiles.get(0).unwrap().density_level, 4);
}

#[test]
fn out_of_bounds_batch_changes_nothing() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    let result = client.try_aggregate_scan_positions(
        &organizer,
        &event_id,
        &positions(&env, &[(1, 1), (40, 0)]),
        &false,
    );
    assert_eq!(result, Err(Ok(LumentixError::ScanPositionOutOfBounds)));
    assert_eq!(client.generate_heatmap_tiles(&event_id).len(), 0);
    assert_eq!(client.get_heatmap_config(&event_id).sequence, 0);
}

#[test]
fn empty_and_oversized_batches_are_rejected() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    let result = client.try_aggregate_scan_positions(&organizer, &event_id, &Vec::new(&env), &false);
    assert_eq!(result, Err(Ok(LumentixError::InvalidScanBatch)));

    let mut big = Vec::new(&env);
    for _ in 0..101 {
        big.push_back(ScanPosition { x: 1, y: 1 });
    }
    let result = client.try_aggregate_scan_positions(&organizer, &event_id, &big, &false);
    assert_eq!(result, Err(Ok(LumentixError::InvalidScanBatch)));
}

#[test]
fn only_organizer_may_report_positions() {
    let env = Env::default();
    let (client, _organizer, event_id) = configured(&env);
    let stranger = Address::generate(&env);

    let result = client.try_aggregate_scan_positions(
        &stranger,
        &event_id,
        &positions(&env, &[(1, 1)]),
        &false,
    );
    assert_eq!(result, Err(Ok(LumentixError::Unauthorized)));
}

#[test]
fn stream_returns_only_tiles_changed_since_cursor() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(1, 1)]), &false);
    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(15, 15)]), &false);

    let full = client.stream_heatmap_updates(&event_id, &0u64);
    assert_eq!(full.from_sequence, 0);
    assert_eq!(full.to_sequence, 2);
    assert_eq!(full.tiles.len(), 2);

    let delta = client.stream_heatmap_updates(&event_id, &1u64);
    assert_eq!(delta.tiles.len(), 1);
    let tile = delta.tiles.get(0).unwrap();
    assert_eq!((tile.tile_x, tile.tile_y), (1, 1));

    let caught_up = client.stream_heatmap_updates(&event_id, &2u64);
    assert_eq!(caught_up.tiles.len(), 0);
    assert_eq!(caught_up.to_sequence, 2);
}

#[test]
fn stream_reports_emptied_tiles_and_congestion() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    client.aggregate_scan_positions(
        &organizer,
        &event_id,
        &positions(&env, &[(1, 1), (2, 2), (3, 3), (4, 4)]),
        &false,
    );
    let update = client.stream_heatmap_updates(&event_id, &0u64);
    assert_eq!(update.congested_tiles, 1);

    // Everyone moves to another tile: the old tile is reported empty.
    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(35, 35)]), &true);
    let update = client.stream_heatmap_updates(&event_id, &1u64);
    assert_eq!(update.tiles.len(), 2);
    assert_eq!(update.congested_tiles, 0);
    let cleared = update.tiles.get(0).unwrap();
    assert_eq!((cleared.tile_x, cleared.count, cleared.density_level), (0, 0, 0));
}

#[test]
fn reconfiguring_clears_tiles_but_keeps_sequence_moving_forward() {
    let env = Env::default();
    let (client, organizer, event_id) = configured(&env);

    client.aggregate_scan_positions(&organizer, &event_id, &positions(&env, &[(1, 1)]), &false);
    client.configure_heatmap(&organizer, &event_id, &20u32, &2u32, &2u32, &4u32);

    assert_eq!(client.generate_heatmap_tiles(&event_id).len(), 0);
    assert!(client.get_heatmap_config(&event_id).sequence > 1);
}
