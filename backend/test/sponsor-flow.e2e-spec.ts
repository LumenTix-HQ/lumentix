import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createStellarServiceMock } from './helpers/test-app.helper';
import { registerAndLogin } from './helpers/auth.helper';
import { clearDatabase } from './helpers/db.helper';

describe('Sponsor Contribution Flow (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let stellarMock: ReturnType<typeof createStellarServiceMock>;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    dataSource = testApp.dataSource;
    stellarMock = testApp.stellarMock;
  });

  beforeEach(async () => {
    await clearDatabase(dataSource);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await clearDatabase(dataSource);
    await app.close();
  });

  it('should complete the full sponsor contribution flow', async () => {
    // ── Step 1: Organizer creates and publishes an event ─────────────────
    const organizer = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        title: 'Sponsor Test Event',
        description: 'Event for sponsor flow testing',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 10,
        currency: 'XLM',
      })
      .expect(201);

    const eventId = createRes.body.id;

    // Publish
    await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'published' })
      .expect(200);

    // ── Step 2: Create sponsor tier ──────────────────────────────────────
    const tierRes = await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: 'Gold Sponsor',
        price: 500,
        benefits: 'Logo on main stage, VIP access, 10 free tickets',
        maxSponsors: 5,
      })
      .expect(201);

    const tierId: string = tierRes.body.id;
    expect(tierId).toBeDefined();
    expect(tierRes.body.name).toBe('Gold Sponsor');
    expect(Number(tierRes.body.price)).toBe(500);
    expect(tierRes.body.maxSponsors).toBe(5);

    // ── Step 3: Verify tier is listed ────────────────────────────────────
    const listTiersRes = await request(app.getHttpServer())
      .get(`/events/${eventId}/tiers`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .expect(200);

    expect(listTiersRes.body).toBeInstanceOf(Array);
    expect(listTiersRes.body.length).toBe(1);
    expect(listTiersRes.body[0].id).toBe(tierId);

    // ── Step 4: Register and login as sponsor ────────────────────────────
    const sponsor = await registerAndLogin(app, 'sponsor');

    // ── Step 5: Create contribution intent ───────────────────────────────
    const intentRes = await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers/contribute/intent`)
      .set('Authorization', `Bearer ${sponsor.token}`)
      .send({ tierId })
      .expect(201);

    const contributionId: string = intentRes.body.contributionId;
    expect(contributionId).toBeDefined();
    expect(Number(intentRes.body.amount)).toBe(500);
    expect(intentRes.body.currency).toBe('XLM');
    expect(intentRes.body.escrowWallet).toBeDefined();
    expect(intentRes.body.memo).toBe(contributionId);

    // ── Step 6: Mock Stellar and confirm contribution ────────────────────
    const mockTxHash = 'mock_sponsor_tx_' + Date.now();
    const escrowWallet = intentRes.body.escrowWallet;

    // Mock getTransaction — return tx with contribution ID as memo
    stellarMock.getTransaction.mockResolvedValueOnce({
      memo: contributionId,
      _links: {
        operations: {
          href: `https://horizon-testnet.stellar.org/transactions/${mockTxHash}/operations`,
        },
      },
    });

    // Mock fetch for resolvePaymentOperations
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              type: 'payment',
              to: escrowWallet,
              amount: '500.0000000',
              asset_type: 'native',
            },
          ],
        },
      }),
    }) as any;

    const confirmRes = await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers/contribute/confirm`)
      .set('Authorization', `Bearer ${sponsor.token}`)
      .send({ transactionHash: mockTxHash })
      .expect(200);

    // Restore fetch
    global.fetch = originalFetch;

    // ── Step 7: Verify contribution is CONFIRMED ─────────────────────────
    expect(confirmRes.body.status).toBe('confirmed');
    expect(confirmRes.body.transactionHash).toBe(mockTxHash);
    expect(confirmRes.body.tierId).toBe(tierId);
    expect(confirmRes.body.sponsorId).toBe(sponsor.userId);
  });

  it('should reject contribution when tier is full', async () => {
    const organizer = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    // Create and publish event
    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        title: 'Full Sponsor Event',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 10,
        currency: 'XLM',
      })
      .expect(201);

    const eventId = createRes.body.id;

    await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'published' })
      .expect(200);

    // Create tier with maxSponsors = 1
    const tierRes = await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: 'Exclusive Sponsor',
        price: 1000,
        maxSponsors: 1,
      })
      .expect(201);

    const tierId = tierRes.body.id;

    // First sponsor — Intent + Confirm
    const sponsor1 = await registerAndLogin(app, 'sponsor');

    const intent1Res = await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers/contribute/intent`)
      .set('Authorization', `Bearer ${sponsor1.token}`)
      .send({ tierId })
      .expect(201);

    const contribution1Id = intent1Res.body.contributionId;
    const escrowWallet = intent1Res.body.escrowWallet;

    stellarMock.getTransaction.mockResolvedValueOnce({
      memo: contribution1Id,
      _links: {
        operations: {
          href: 'https://horizon-testnet.stellar.org/tx/ops',
        },
      },
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              type: 'payment',
              to: escrowWallet,
              amount: '1000.0000000',
              asset_type: 'native',
            },
          ],
        },
      }),
    }) as any;

    await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers/contribute/confirm`)
      .set('Authorization', `Bearer ${sponsor1.token}`)
      .send({ transactionHash: 'tx_sponsor1_' + Date.now() })
      .expect(200);

    global.fetch = originalFetch;

    // Second sponsor — should fail at intent (tier full)
    const sponsor2 = await registerAndLogin(app, 'sponsor');

    await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers/contribute/intent`)
      .set('Authorization', `Bearer ${sponsor2.token}`)
      .send({ tierId })
      .expect(409); // ConflictException — tier is full
  });

  it('should allow listing tiers without authentication', async () => {
    const organizer = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        title: 'Public Tiers Event',
        startDate: futureStart,
        endDate: futureEnd,
      })
      .expect(201);

    const eventId = createRes.body.id;

    // Create a tier
    await request(app.getHttpServer())
      .post(`/events/${eventId}/tiers`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        name: 'Bronze',
        price: 100,
        maxSponsors: 10,
      })
      .expect(201);

    // List tiers WITHOUT auth token — should still work (public endpoint)
    const listRes = await request(app.getHttpServer())
      .get(`/events/${eventId}/tiers`)
      .expect(200);

    expect(listRes.body).toBeInstanceOf(Array);
    expect(listRes.body.length).toBe(1);
  });
});
