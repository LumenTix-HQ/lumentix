import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingEntityIndexes1710000000001 implements MigrationInterface {
  name = 'AddMissingEntityIndexes1710000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Events — filtered by organizerId, status, startDate
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events ("organizerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_events_status ON events (status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_events_start_date ON events ("startDate")`);

    // Wallet — filtered by userId
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets ("userId")`);

    // Chat messages — filtered by eventId, userId, createdAt
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_event_id ON chat_messages ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages ("createdAt")`);

    // VIP assignments — filtered by eventId, userId
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vip_assignments_event_id ON vip_assignments ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vip_assignments_user_id ON vip_assignments ("userId")`);

    // Seats — filtered by venueId, section
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_seats_venue_id ON seats ("venueId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_seats_section ON seats (section)`);

    // Venue sections — filtered by venueId
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_venue_sections_venue_id ON venue_sections ("venueId")`);

    // Audit logs — filtered by userId, action, createdAt
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs ("createdAt")`);

    // Categories — filtered by parentId
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories ("parentId")`);

    // Collaboration entities
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_events_event_id ON collaboration_events ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_events_user_id ON collaboration_events ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_invites_event_id ON collaboration_invites ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_invites_user_id ON collaboration_invites ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_messages_event_id ON collaboration_messages ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_messages_user_id ON collaboration_messages ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_collab_settings_event_id ON collaboration_settings ("eventId")`);

    // Payments — filtered by userId, eventId, status
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payments_event_id ON payments ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status)`);

    // Tickets — filtered by ownerId, eventId, status
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tickets_owner_id ON tickets ("ownerId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tickets_event_id ON tickets ("eventId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets (status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_events_organizer_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_events_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_events_start_date`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_wallets_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_messages_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_messages_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_chat_messages_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vip_assignments_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_vip_assignments_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_seats_venue_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_seats_section`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_venue_sections_venue_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_action`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_logs_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_categories_parent_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_events_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_events_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_invites_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_invites_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_messages_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_messages_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_collab_settings_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payments_user_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payments_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payments_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tickets_owner_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tickets_event_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tickets_status`);
  }
}
