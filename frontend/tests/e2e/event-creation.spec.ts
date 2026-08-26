import { test, expect } from '@playwright/test';
import { seedAuthCookie } from './helpers';

// Event-creation journey against a stubbed create-event endpoint.
test.describe('Event creation', () => {
  test('an organizer can fill and submit the create-event form', async ({ page, baseURL }) => {
    await seedAuthCookie(page, baseURL ?? 'http://localhost:3000');

    await page.route('**/events', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'evt-123', title: 'Playwright Summit' }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto('/create');

    await page.getByLabel('Event Title').fill('Playwright Summit');
    await page.getByLabel('Location').fill('Remote');
    await page.getByLabel('Ticket Price').fill('10');
    await page.getByLabel('Currency').fill('XLM');

    // Submit the form.
    await page.getByRole('button', { name: /create|publish|submit/i }).first().click();

    // The form either navigates away or surfaces a success state.
    await expect(page.getByText(/success|created|Playwright Summit/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
