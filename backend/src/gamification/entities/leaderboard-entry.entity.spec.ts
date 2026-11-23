import { getMetadataArgsStorage } from 'typeorm';
import {
  LeaderboardEntry,
  LeaderboardPeriod,
} from './leaderboard-entry.entity';

describe('LeaderboardEntry', () => {
  const metadata = getMetadataArgsStorage();

  it('maps to one leaderboard snapshot table', () => {
    const tables = metadata.tables.filter(
      (table) => table.target === LeaderboardEntry,
    );

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('leaderboard_entries');
  });

  it('has a single period enum with lowercase values', () => {
    expect(LeaderboardPeriod).toEqual({
      ALL_TIME: 'all_time',
      MONTHLY: 'monthly',
      WEEKLY: 'weekly',
    });
  });

  it('declares each leaderboard column exactly once', () => {
    const columns = metadata.columns
      .filter((column) => column.target === LeaderboardEntry)
      .map((column) => column.propertyName);

    expect(columns).toHaveLength(10);
    expect(new Set(columns).size).toBe(columns.length);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'userId',
        'period',
        'periodLabel',
        'rank',
        'xp',
        'level',
        'achievementCount',
        'displayName',
        'snapshotAt',
      ]),
    );
  });
});
