import { test, expect } from '@playwright/test';
import { booking as fixture } from '../stay-fixtures';
test('reviews arrival, retries the same action, then records departure and filters attendance', async ({
  page,
}) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (k: string) => parts.find((p) => p.type === k)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  let current = {
    ...fixture,
    check_in: today,
    check_out: '2099-12-31',
    checked_in_at: null as string | null,
    checked_out_at: null as string | null,
  };
  // Keep the date window <=365 nights, matching actual API responses.
  current.check_out = new Date(Date.parse(today + 'T00:00:00Z') + 2 * 86400000)
    .toISOString()
    .slice(0, 10);
  let attempts = 0;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'attendance-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    expect(request.headers().authorization).toBe('Bearer attendance-browser');
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: { name: 'Staff', permission_type: 'all', permissions: [] },
          },
        },
      });
    if (path.endsWith('/51/check-in')) {
      expect(request.postDataJSON()).toEqual({});
      attempts++;
      current = { ...current, checked_in_at: new Date().toISOString() };
      if (attempts === 1) return route.abort('failed');
      return route.fulfill({ json: { data: current } });
    }
    if (path.endsWith('/51/check-out')) {
      expect(request.postDataJSON()).toEqual({});
      current = { ...current, checked_out_at: new Date(Date.now() + 1000).toISOString() };
      return route.fulfill({ json: { data: current } });
    }
    if (path.endsWith('/stay-bookings'))
      return route.fulfill({
        json: { data: [current], meta: { current_page: 1, last_page: 1, total: 1 } },
      });
    return route.fulfill({ json: { data: current } });
  });
  await page.goto('/staff/stay-bookings/51');
  await page.getByRole('button', { name: 'Record check-in', exact: true }).click();
  expect(attempts).toBe(0);
  await page.getByRole('button', { name: 'Confirm check-in', exact: true }).click();
  await expect(page.getByText(/Outcome uncertain. Retry this same attendance/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Keep attendance unchanged', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Confirm check-in', exact: true }).click();
  await expect(page.getByText('Current attendance: Checked in', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByRole('button', { name: 'Record check-out', exact: true }).click();
  await expect(page.getByText(/Early checkout keeps the original room dates/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirm check-out', exact: true }).click();
  await expect(page.getByText('Current attendance: Checked out', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record check-in', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Balance: ₹3,900.99/)).toBeVisible();
  await page.getByRole('link', { name: '← Stay bookings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Attendance', exact: true }).selectOption('checked_out');
  await page.getByRole('button', { name: 'Filter bookings', exact: true }).click();
  await expect(page).toHaveURL(/attendance_status=checked_out/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Attendance', exact: true })).toHaveValue(
    'checked_out',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
