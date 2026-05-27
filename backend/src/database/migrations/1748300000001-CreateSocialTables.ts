import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSocialTables1748300000001 implements MigrationInterface {
  name = 'CreateSocialTables1748300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── social_profiles ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "social_profiles_visibility_enum"
        AS ENUM ('public', 'connections_only', 'private')
    `);

    await queryRunner.query(`
      CREATE TABLE "social_profiles" (
        "id"                       UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "userId"                   UUID          NOT NULL,
        "displayName"              VARCHAR(100),
        "bio"                      TEXT,
        "title"                    VARCHAR(100),
        "socialLinks"              JSONB         NOT NULL DEFAULT '{}',
        "interests"                TEXT,
        "visibility"               "social_profiles_visibility_enum" NOT NULL DEFAULT 'public',
        "showInAttendeeList"       BOOLEAN       NOT NULL DEFAULT true,
        "acceptConnectionRequests" BOOLEAN       NOT NULL DEFAULT true,
        "allowDirectMessages"      BOOLEAN       NOT NULL DEFAULT true,
        "createdAt"                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"                TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_social_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_social_profiles_userId" UNIQUE ("userId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_social_profiles_userId" ON "social_profiles" ("userId")
    `);

    // ── attendee_connections ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "attendee_connections_status_enum"
        AS ENUM ('pending', 'accepted', 'declined', 'blocked')
    `);

    await queryRunner.query(`
      CREATE TABLE "attendee_connections" (
        "id"           UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "requesterId"  UUID          NOT NULL,
        "recipientId"  UUID          NOT NULL,
        "status"       "attendee_connections_status_enum" NOT NULL DEFAULT 'pending',
        "message"      TEXT,
        "eventId"      UUID,
        "createdAt"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendee_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_attendee_connections_pair" UNIQUE ("requesterId", "recipientId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_attendee_connections_requesterId"
        ON "attendee_connections" ("requesterId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendee_connections_recipientId_status"
        ON "attendee_connections" ("recipientId", "status")
    `);

    // ── meetup_groups ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "meetup_groups_status_enum"
        AS ENUM ('open', 'closed', 'cancelled')
    `);

    await queryRunner.query(`
      CREATE TABLE "meetup_groups" (
        "id"            UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "eventId"       UUID          NOT NULL,
        "creatorId"     UUID          NOT NULL,
        "name"          VARCHAR(150)  NOT NULL,
        "description"   TEXT,
        "meetingPoint"  VARCHAR(200),
        "meetingTime"   TIMESTAMPTZ,
        "maxMembers"    INTEGER,
        "status"        "meetup_groups_status_enum" NOT NULL DEFAULT 'open',
        "topics"        TEXT,
        "createdAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meetup_groups" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_meetup_groups_eventId" ON "meetup_groups" ("eventId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_meetup_groups_creatorId" ON "meetup_groups" ("creatorId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_meetup_groups_eventId_status"
        ON "meetup_groups" ("eventId", "status")
    `);

    // ── meetup_members ────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "meetup_members_role_enum"
        AS ENUM ('creator', 'member')
    `);

    await queryRunner.query(`
      CREATE TABLE "meetup_members" (
        "id"        UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "groupId"   UUID          NOT NULL,
        "userId"    UUID          NOT NULL,
        "role"      "meetup_members_role_enum" NOT NULL DEFAULT 'member',
        "joinedAt"  TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_meetup_members" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_meetup_members_group_user" UNIQUE ("groupId", "userId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_meetup_members_groupId" ON "meetup_members" ("groupId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_meetup_members_userId" ON "meetup_members" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "meetup_members"`);
    await queryRunner.query(`DROP TYPE "meetup_members_role_enum"`);
    await queryRunner.query(`DROP TABLE "meetup_groups"`);
    await queryRunner.query(`DROP TYPE "meetup_groups_status_enum"`);
    await queryRunner.query(`DROP TABLE "attendee_connections"`);
    await queryRunner.query(`DROP TYPE "attendee_connections_status_enum"`);
    await queryRunner.query(`DROP TABLE "social_profiles"`);
    await queryRunner.query(`DROP TYPE "social_profiles_visibility_enum"`);
  }
}
