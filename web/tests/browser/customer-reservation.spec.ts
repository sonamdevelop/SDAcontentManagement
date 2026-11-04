import { test, expect } from '@playwright/test';
import { customer } from '../customer-fixtures';
import { reservationQuote, reservedBooking } from '../reservation-fixtures';
test('reviews a customer reservation and retries the same UUID after an uncertain response', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  let reserved = false;
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.customer.token', 'reservation-browser');
    sessionStorage.setItem('sda.staff.token', 'staff-must-stay-private');
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer reservation-browser');
    expect(req.headers().cookie).toBeUndefined();
    if (url.pathname.endsWith('/customer/me')) return route.fulfill({ json: { data: customer } });
    if (url.pathname.endsWith('/availability'))
      return route.fulfill({ json: { data: reservationQuote } });
    if (url.pathname.endsWith('/customer/bookings') && req.method() === 'POST') {
      bodies.push(req.postDataJSON());
      expect(req.postDataJSON()).not.toHaveProperty('advance');
      expect(req.postDataJSON()).not.toHaveProperty('customer_id');
      reserved = true;
      if (bodies.length === 1) return route.abort('failed');
      return route.fulfill({ json: { data: reservedBooking } });
    }
    if (url.pathname.endsWith('/customer/bookings/51')) {
      expect(reserved).toBe(true);
      return route.fulfill({ json: { data: reservedBooking } });
    }
    throw new Error('Unexpected ' + url.pathname);
  });
  await page.goto('/account/reserve?room_type_id=2');
  await page.getByLabel('Reservation check-in', { exact: true }).fill('2030-01-01');
  await page.getByLabel('Reservation check-out', { exact: true }).fill('2030-01-03');
  await page.getByRole('button', { name: 'Check room availability', exact: true }).click();
  await page.getByLabel('Reservation rooms', { exact: true }).fill('2');
  await page.getByLabel('Reservation guests', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await expect(page.getByText('Reservation total: ₹4,001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm reservation', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry same reservation', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit reservation', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry same reservation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My booking #51', exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await expect(page.getByText(/Outstanding: ₹4,001/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('does not offer confirmation for an exhausted date range', async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem('sda.customer.token', 'reservation-browser'),
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/customer/me')) return route.fulfill({ json: { data: customer } });
    if (path.endsWith('/availability'))
      return route.fulfill({ json: { data: { ...reservationQuote, available_rooms: 0 } } });
    throw new Error('Unexpected ' + path);
  });
  await page.goto('/account/reserve?room_type_id=2');
  await page.getByLabel('Reservation check-in', { exact: true }).fill('2030-01-01');
  await page.getByLabel('Reservation check-out', { exact: true }).fill('2030-01-03');
  await page.getByRole('button', { name: 'Check room availability', exact: true }).click();
  await expect(
    page.getByText('No rooms are available for these dates. Choose another range or room.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm reservation', exact: true })).toHaveCount(
    0,
  );
});
