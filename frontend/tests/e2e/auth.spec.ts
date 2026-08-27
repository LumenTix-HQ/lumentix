import { test, expect } from '@playwright/test';

// Login / logout journey. The backend auth endpoint is stubbed so the test is
// hermetic and does not require a running API.
test.describe('Authentication', () => {
  test('a user can log in and is redirected to events', async ({ page }) => {
    await page.route('**/auth/login', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ access_token: 'fake.jwt.token' }),
      }),
    );

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('user@example.com');
    await page.getByLabel(/password/i).fill('password1');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page).toHaveURL(/\/events/);
  });

  test('invalid credentials show an error', async ({ page }) => {
    await page.route('**/auth/login', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }),
    );

    await page.goto('/login');
    await page.getByLabel(/email/i).fill('user@example.com');
    await page.getByLabel(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });
});
