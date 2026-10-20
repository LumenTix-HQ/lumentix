import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the `conflict_resolutions` audit table.
 *
 * Every time `SchedulingService.resolveConflict()` finds a conflict, a row is
 * inserted here so that:
 *   - organizers can review why their original slot was rejected,
 *   - admins can audit booking friction trends per venue, and
 *   - the system can detect venues that are chronically over-subscribed.
 *
 * The table is append-only: rows are never updated or deleted (soft-delete
 * pattern via `archivedAt`).
 *
 * Enum values mirror the `ConflictResolution.outcome` union type in
 * `scheduling.service.ts`:
 *   no_conflict | alternative_available | unresolved
 */
export class CreateConflictResolutionsTable1770200000000 implements MigrationInterface {
  name = 'CreateConflictResolutionsTable1770200000000';

  // ── up ────────────────────────────────────────────────────────────────────

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── outcome enum ──────────────────────────────────────────────────────
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "conflict_resolutions_outcome_enum" AS ENUM (
          'no_conflict', 'alternative_available', 'unresolved'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$
    `);

    // ── conflict_resolutions ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "conflict_resolutions" (
        "id"                uuid        NOT NULL DEFAULT uuid_generate_v4(),

        -- Who triggered the check and for which event (nullable — checks can
        -- be made before an event is created).
        "requestedBy"       uuid        DEFAULT NULL,
        "eventId"           uuid        DEFAULT NULL,

        -- The venue and slot that was checked.
        "venue"             varchar     NOT NULL,
        "requestedStart"    TIMESTAMP   NOT NULL,
        "requestedEnd"      TIMESTAMP   NOT NULL,

        -- Outcome of the resolution attempt.
        "outcome"           "conflict_resolutions_outcome_enum" NOT NULL,

        -- JSONB snapshot of every conflicting event at the time of the check.
        -- Stored as a point-in-time record so the audit remains accurate even
        -- if the conflicting events are later cancelled or rescheduled.
        "conflicts"         jsonb       NOT NULL DEFAULT '[]',

        -- The slot that was recommended (null when outcome = no_conflict or unresolved).
        "recommendedStart"  TIMESTAMP   DEFAULT NULL,
        "recommendedEnd"    TIMESTAMP   DEFAULT NULL,
        "recommendedShift"  numeric(10,2) DEFAULT NULL,

        -- Human-readable reasoning lines, stored as a JSONB array of strings.
        "reasoning"         jsonb       NOT NULL DEFAULT '[]',

        "createdAt"         TIMESTAMP   NOT NULL DEFAULT now(),

        -- Soft-delete: set when the organizer dismisses the resolution or
        -- the related event is deleted.
        "archivedAt"        TIMESTAMP   DEFAULT NULL,

        CONSTRAINT "PK_conflict_resolutions_id" PRIMARY KEY ("id"),

        -- FK to users — allow NULL so anonymous / pre-auth checks are valid.
        CONSTRAINT "FK_conflict_resolutions_requestedBy"
          FOREIGN KEY ("requestedBy") REFERENCES "users"("id") ON DELETE SET NULL,

        -- FK to events — allow NULL for pre-creation checks; SET NULL on delete
        -- so the audit row survives after the event is removed.
        CONSTRAINT "FK_conflict_resolutions_eventId"
          FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL
      )
    `);

    // ── Indexes ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conflict_resolutions_requestedBy"
        ON "conflict_resolutions" ("requestedBy")
      WHERE "requestedBy" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conflict_resolutions_eventId"
        ON "conflict_resolutions" ("eventId")
      WHERE "eventId" IS NOT NULL
    `);

    // Venue + outcome is the primary analytical query: "how often is venue X
    // fully booked vs partially conflicted?"
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conflict_resolutions_venue_outcome"
        ON "conflict_resolutions" ("venue", "outcome")
    `);

    // Time-range scans for dashboard queries ("all unresolved conflicts this month").
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_conflict_resolutions_createdAt"
        ON "conflict_resolutions" ("createdAt")
    `);
  }

  // ── down ──────────────────────────────────────────────────────────────────

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "conflict_resolutions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "conflict_resolutions_outcome_enum"`);
  }
}
