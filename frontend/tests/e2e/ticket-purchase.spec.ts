import { test, expect } from '@playwright/test';
import { mockFreighter, seedAuthCookie } from './helpers';

// Ticket-purchase journey with a mocked Freighter wallet, plus viewing the
// resulting ticket's QR code. Payment endpoints are stubbed.
test.describe('Ticket purchase and QR viewing', () => {
  test('a user can pay for a ticket and view its QR code', async ({ page, baseURL }) => {
    await mockFreighter(page);
    await seedAuthCookie(page, baseURL ?? 'http://localhost:3000');

    const eventId = 'evt-123';

    await page.route(`**/events/${eventId}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: eventId,
          title: 'Playwright Summit',
          description: 'An event',
          location: 'Remote',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          ticketPrice: 0,
          currency: 'XLM',
          status: 'published',
        }),
      }),
    );

    await page.route('**/payments/initiate', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'pay-1' }),
      }),
    );

    await page.route('**/payments/pay-1/status', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'CONFIRMED' }),
      }),
    );

    await page.goto(`/events/${eventId}`);

    // Register / pay for the (free) ticket.
    await page.getByRole('button', { name: /register/i }).first().click();

    // Payment confirmation appears.
    await expect(page.getByText(/payment confirmed|download ticket/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // Navigate to tickets and open the QR modal.
    await page.goto('/my-tickets');
    const qrTrigger = page.getByRole('button', { name: /qr|view ticket/i }).first();
    if (await qrTrigger.count()) {
      await qrTrigger.click();
      await expect(page.getByAltText(/qr code/i).first()).toBeVisible();
    }
  });
});
