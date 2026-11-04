import { test, expect } from '@playwright/test';
import { customer, customerBooking, customerPage } from '../customer-fixtures';
test('customer login, owned bookings and logout use separate tokens on desktop/mobile', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'staff-secret'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    expect(req.headers().cookie).toBeUndefined();
    if (path.endsWith('/customer/auth/login')) {
      expect(req.headers().authorization).toBeUndefined();
      return route.fulfill({
        status: 201,
        json: {
          data: {
            access_token: 'customer-browser',
            token_type: 'Bearer',
            expires_at: '2030-01-01T00:00:00Z',
          },
        },
      });
    }
    expect(req.headers().authorization).toBe('Bearer customer-browser');
    if (path.endsWith('/customer/me')) return route.fulfill({ json: { data: customer } });
    if (path.endsWith('/customer/bookings')) return route.fulfill({ json: customerPage });
    if (path.endsWith('/customer/bookings/51'))
      return route.fulfill({ json: { data: customerBooking } });
    if (path.endsWith('/customer/auth/logout')) return route.fulfill({ status: 204 });
    throw new Error('Unexpected ' + path);
  });
  await page.goto('/account/bookings');
  await page.getByLabel('Customer email', { exact: true }).fill(customer.email);
  await page.getByLabel('Customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByRole('button', { name: 'Sign in customer', exact: true }).click();
  await page.getByRole('link', { name: 'Historic forest stay — Deluxe #51', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My booking #51', exact: true })).toBeVisible();
  await expect(page.getByText(/Outstanding: ₹3,900.99/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My booking #51', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign out customer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in customer', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('sda.customer.token'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('sda.staff.token'))).toBe('staff-secret');
});
test('profile/password updates sign out the customer only after confirmed success', async ({
  page,
}) => {
  let current = { ...customer };
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.customer.token', 'customer-browser');
    sessionStorage.setItem('sda.staff.token', 'staff-secret');
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    expect(req.headers().authorization).toBe('Bearer customer-browser');
    if (path.endsWith('/customer/me')) {
      if (req.method() === 'PATCH') current = { ...current, ...req.postDataJSON() };
      return route.fulfill({ json: { data: current } });
    }
    if (path.endsWith('/customer/password')) return route.fulfill({ status: 204 });
    throw new Error('Unexpected ' + path);
  });
  await page.goto('/account');
  await page.getByLabel('Profile name', { exact: true }).fill('Updated Customer');
  await page.getByLabel('Profile phone', { exact: true }).fill('+91 9000000000');
  await page.getByRole('button', { name: 'Save customer profile', exact: true }).click();
  await expect(page.getByText('Signed in as Updated Customer', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Change password', exact: true }).click();
  await page.getByLabel('Current customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByLabel('New customer password', { exact: true }).fill('ReplacementPass456!');
  await page
    .getByLabel('Confirm new customer password', { exact: true })
    .fill('ReplacementPass456!');
  await page.getByRole('button', { name: 'Update customer password', exact: true }).click();
  await expect(
    page.getByText('Password changed. Sign in with your new password.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('sda.customer.token'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('sda.staff.token'))).toBe('staff-secret');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('does not show a foreign booking and returns an expired customer session to login', async ({
  page,
}) => {
  let expired = false;
  await page.addInitScript(() => sessionStorage.setItem('sda.customer.token', 'customer-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/customer/me'))
      return expired
        ? route.fulfill({ status: 401, json: { message: 'Unauthenticated' } })
        : route.fulfill({ json: { data: customer } });
    if (path.endsWith('/customer/bookings/999'))
      return route.fulfill({ status: 404, json: { message: 'Not found' } });
    throw new Error('Unexpected ' + path);
  });
  await page.goto('/account/bookings/999');
  await expect(
    page.getByText('This booking is not available to your account.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: /My booking #/ })).toHaveCount(0);
  expired = true;
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in customer', exact: true })).toBeVisible();
  await expect(
    page.getByText('Your customer session ended. Please sign in again.', { exact: true }),
  ).toBeVisible();
});
