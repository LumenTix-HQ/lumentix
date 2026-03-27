import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { createTestApp, createStellarServiceMock } from './helpers/test-app.helper';
import { registerAndLogin } from './helpers/auth.helper';
import { clearDatabase } from './helpers/db.helper';

describe('Payment Flow (e2e)', () => {
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

  it('should complete the full payment → ticket flow', async () => {
    // ── Setup: Organizer creates and publishes an event ───────────────────
    const organizer = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        title: 'Payment Test Event',
        description: 'Event for payment flow testing',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 10,
        currency: 'XLM',
        maxAttendees: 50,
      })
      .expect(201);

    const eventId = createRes.body.id;

    // Publish the event
    await request(app.getHttpServer())
      .put(`/events/${eventId}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'published' })
      .expect(200);

    // ── Step 1: Register and login as event_goer ─────────────────────────
    const goer = await registerAndLogin(app, 'attendee');

    // ── Step 2: Create payment intent ────────────────────────────────────
    const intentRes = await request(app.getHttpServer())
      .post('/payments/intent')
      .set('Authorization', `Bearer ${goer.token}`)
      .send({ eventId })
      .expect(201);

    const paymentId: string = intentRes.body.paymentId;
    expect(paymentId).toBeDefined();
    expect(intentRes.body.amount).toBe(10);
    expect(intentRes.body.currency).toBe('XLM');
    expect(intentRes.body.escrowWallet).toBeDefined();
    expect(intentRes.body.memo).toBe(paymentId);
    expect(intentRes.body.expiresAt).toBeDefined();

    // ── Step 3: Mock StellarService for payment confirmation ─────────────
    const mockTxHash = 'mock_tx_hash_' + Date.now();
    const escrowWallet = intentRes.body.escrowWallet;

    // Mock getTransaction to return a tx record with the paymentId as memo
    stellarMock.getTransaction.mockResolvedValueOnce({
      memo: paymentId,
      _links: {
        operations: {
          href: `https://horizon-testnet.stellar.org/transactions/${mockTxHash}/operations`,
        },
      },
    });

    // Mock the fetch call for resolvePaymentOperations
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        _embedded: {
          records: [
            {
              type: 'payment',
              to: escrowWallet,
              amount: '10.0000000',
              asset_type: 'native',
            },
          ],
        },
      }),
    }) as any;

    // ── Step 4: Confirm payment ──────────────────────────────────────────
    const confirmRes = await request(app.getHttpServer())
      .post('/payments/confirm')
      .set('Authorization', `Bearer ${goer.token}`)
      .send({ transactionHash: mockTxHash })
      .expect(200);

    expect(confirmRes.body.status).toBe('confirmed');
    expect(confirmRes.body.transactionHash).toBe(mockTxHash);

    // Restore fetch
    global.fetch = originalFetch;

    // ── Step 5: Mock StellarService again for ticket issuance ────────────
    // issueTicket calls stellarService.getTransaction again to verify memo
    stellarMock.getTransaction.mockResolvedValueOnce({
      memo: paymentId,
      _links: { operations: { href: '' } },
    });

    const issueRes = await request(app.getHttpServer())
      .post('/tickets/issue')
      .set('Authorization', `Bearer ${goer.token}`)
      .send({ paymentId })
      .expect(201);

    expect(issueRes.body.ticket).toBeDefined();
    expect(issueRes.body.ticket.status).toBe('valid');
    expect(issueRes.body.ticket.ownerId).toBe(goer.userId);
    expect(issueRes.body.ticket.eventId).toBe(eventId);
    expect(issueRes.body.signature).toBeDefined();
    expect(issueRes.body.qrCodeDataUrl).toBeDefined();

    // ── Step 6: Verify ticket appears in "my tickets" ────────────────────
    const myTicketsRes = await request(app.getHttpServer())
      .get('/tickets/my')
      .set('Authorization', `Bearer ${goer.token}`)
      .expect(200);

    // The response is paginated
    const tickets = myTicketsRes.body.data || myTicketsRes.body;
    const isArray = Array.isArray(tickets);
    if (isArray) {
      expect(tickets.length).toBeGreaterThanOrEqual(1);
      expect(tickets[0].eventId).toBe(eventId);
    } else {
      // Paginated response
      expect(myTicketsRes.body.data).toBeDefined();
    }
  });

  it('should reject payment intent for unpublished event', async () => {
    const organizer = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    // Create event but do NOT publish it (stays as draft)
    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        title: 'Unpublished Event',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 10,
        currency: 'XLM',
      })
      .expect(201);

    const eventId = createRes.body.id;

    // Try to create a payment intent — should fail
    const goer = await registerAndLogin(app, 'attendee');

    await request(app.getHttpServer())
      .post('/payments/intent')
      .set('Authorization', `Bearer ${goer.token}`)
      .send({ eventId })
      .expect(400);
  });

  it('should reject ticket issuance for unconfirmed payment', async () => {
    const organizer = await registerAndLogin(app, 'organizer');

    const futureStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();

    // Create and publish event
    const createRes = await request(app.getHttpServer())
      .post('/events')
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({
        title: 'Ticket Rejection Event',
        startDate: futureStart,
        endDate: futureEnd,
        ticketPrice: 5,
        currency: 'XLM',
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/events/${createRes.body.id}`)
      .set('Authorization', `Bearer ${organizer.token}`)
      .send({ status: 'published' })
      .expect(200);

    // Create payment intent (still PENDING — not confirmed)
    const goer = await registerAndLogin(app, 'attendee');

    const intentRes = await request(app.getHttpServer())
      .post('/payments/intent')
      .set('Authorization', `Bearer ${goer.token}`)
      .send({ eventId: createRes.body.id })
      .expect(201);

    // Try to issue ticket without confirming payment — should fail
    await request(app.getHttpServer())
      .post('/tickets/issue')
      .set('Authorization', `Bearer ${goer.token}`)
      .send({ paymentId: intentRes.body.paymentId })
      .expect(400);
  });
});
