import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Issue #1131: Add indexes on audit_logs.createdAt for hot paths
 * 
 * The AuditLog entity is an append-only table growing for the life of the platform.
 * Two queries heavily use createdAt but it was unindexed:
 * 1. list() delegates to paginate() with default sortBy='createdAt', order='DESC'
 * 2. prune(retentionDays) runs delete({ createdAt: LessThan(cutoff) })
 * 
 * This migration adds:
 * - Single [createdAt] index for retention prune queries
 * - Composite [userId, createdAt] index for user-scoped log listings
 */
export class AddAuditLogCreatedAtIndexes1770100000000 implements MigrationInterface {
  name = 'AddAuditLogCreatedAtIndexes1770100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Single index on createdAt for retention prune queries (and general time-range queries)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_v2 ON audit_logs ("createdAt" DESC) WHERE "createdAt" IS NOT NULL`,
    );

    // Composite index [userId, createdAt] for user-scoped listings
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs ("userId", "createdAt" DESC) WHERE "userId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_created_at_v2`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_user_created_at`);
  }
}
