import { test, expect } from '@playwright/test';
import { stay, booking as fixture, stayMeta as meta } from '../stay-fixtures';
test('checks room availability, retries uncertain booking and cancels with history', async ({
  page,
}) => {
  let booking = { ...fixture },
    attempts = 0;
  const payloads: unknown[] = [];
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'stay-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    expect(req.headers().authorization).toBe('Bearer stay-browser');
    expect(req.headers().cookie).toBeUndefined();
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'a@example.test',
            role: { name: 'Staff', permission_type: 'all', permissions: [] },
          },
        },
      });
    if (path.endsWith('/admin/stays')) return route.fulfill({ json: { data: [stay], meta } });
    if (path.endsWith('/availability')) {
      expect(url.searchParams.get('check_in')).toBe('2030-01-01');
      return route.fulfill({
        json: {
          data: {
            room_type_id: 2,
            check_in: '2030-01-01',
            check_out: '2030-01-03',
            nights: 2,
            timezone: 'Asia/Kolkata',
            nightly_rate: '1000.25',
            currency: 'INR',
            capacity: 2,
            available_rooms: 2,
          },
        },
      });
    }
    if (path.endsWith('/stay-bookings') && req.method() === 'POST') {
      attempts++;
      payloads.push(req.postDataJSON());
      expect(req.postDataJSON()).toMatchObject({
        rooms: 2,
        guests: 4,
        advance: '100.01',
        expected_rate: '1000.25',
      });
      if (attempts === 1) return route.abort('failed');
      expect(payloads[1]).toEqual(payloads[0]);
      return route.fulfill({ status: 201, json: { data: booking } });
    }
    if (path.endsWith('/51/cancel')) {
      expect(req.postDataJSON()).toEqual({ cancellation_reason: 'Customer changed dates' });
      booking = {
        ...booking,
        status: 'cancelled',
        cancellation_reason: 'Customer changed dates',
        events: [
          ...booking.events!,
          {
            id: 2,
            actor_id: 1,
            action: 'cancelled',
            changes: { cancellation_reason: 'Customer changed dates' },
            created_at: '2026-11-02T10:00:00Z',
          },
        ],
      };
      return route.fulfill({ json: { data: booking } });
    }
    if (path.endsWith('/stay-bookings/51')) return route.fulfill({ json: { data: booking } });
    if (path.endsWith('/stay-bookings')) return route.fulfill({ json: { data: [booking], meta } });
    throw new Error(`Unexpected ${req.method()} ${path}`);
  });
  await page.goto('/staff/stay-bookings/new');
  await page.getByRole('combobox', { name: 'Booking room type', exact: true }).selectOption('2');
  await page.getByLabel('Check-in date', { exact: true }).fill('2030-01-01');
  await page.getByLabel('Check-out date', { exact: true }).fill('2030-01-03');
  await page.getByRole('button', { name: 'Check availability', exact: true }).click();
  await expect(page.getByText(/2 rooms available/)).toBeVisible();
  await page.getByLabel('Number of rooms', { exact: true }).fill('2');
  await page.getByLabel('Number of guests', { exact: true }).fill('4');
  await page.getByLabel('Guest name', { exact: true }).fill('Guest');
  await page.getByLabel('Recorded booking advance', { exact: true }).fill('100.01');
  await expect(page.getByText('Quoted total: ₹4,001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save stay booking', exact: true }).click();
  await expect(page.getByLabel('Guest name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same booking', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Stay booking #51', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel stay booking', exact: true }).click();
  await page
    .getByLabel('Booking cancellation reason', { exact: true })
    .fill('Customer changed dates');
  await page.getByRole('button', { name: 'Yes, cancel stay booking', exact: true }).click();
  await expect(
    page.getByText('Booking cancellation: Customer changed dates', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Booking history', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel stay booking', exact: true })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('read-only booking staff cannot create or cancel bookings', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'stay-reader'));
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      json: {
        data: new URL(route.request().url()).pathname.endsWith('/auth/me')
          ? {
              id: 1,
              name: 'Reader',
              email: 'a@example.test',
              role: {
                name: 'Reader',
                permission_type: 'custom',
                permissions: ['stay-bookings.view'],
              },
            }
          : fixture,
      },
    }),
  );
  await page.goto('/staff/stay-bookings/51');
  await expect(page.getByRole('heading', { name: 'Stay booking #51', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel stay booking', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: 'New stay booking', exact: true })).toHaveCount(0);
});
test('finds bookings with combined IDs and inclusive arrival filters across URL reloads', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'finder-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer finder-browser');
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: { name: 'Reader', permission_type: 'custom', permissions: ['stay-bookings'] },
          },
        },
      });
    if (url.pathname.endsWith('/stay-bookings'))
      return route.fulfill({
        json: {
          data: [fixture],
          meta: { current_page: Number(url.searchParams.get('page') || 1), last_page: 2, total: 2 },
        },
      });
    throw new Error('Unexpected request ' + url.pathname);
  });
  await page.goto('/staff/stay-bookings');
  await page.getByLabel('Stay ID', { exact: true }).fill('1');
  await page.getByLabel('Booking ID', { exact: true }).fill('51');
  await page.getByLabel('Arrival from', { exact: true }).fill('2030-01-01');
  await page.getByLabel('Arrival to', { exact: true }).fill('2030-01-02');
  await page.getByRole('button', { name: 'Filter bookings', exact: true }).click();
  await expect(page).toHaveURL(/stay_id=1/);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(page.getByLabel('Arrival from', { exact: true })).toHaveValue('2030-01-01');
  await expect(page.getByLabel('Booking ID', { exact: true })).toHaveValue('51');
  await expect(page.getByRole('link', { name: /River stay — Deluxe #/ })).toHaveCount(0);
  await page.getByRole('link', { name: 'Clear booking filters', exact: true }).click();
  await expect(page).toHaveURL('/staff/stay-bookings');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
