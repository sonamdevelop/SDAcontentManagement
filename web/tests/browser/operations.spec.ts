import { test, expect } from '@playwright/test';
import { operations } from '../operations-fixtures';
import { stay, stayMeta as meta } from '../stay-fixtures';
test('switches scheduled/live queues, preserves URL filters and refreshes departures on desktop/mobile', async ({
  page,
}) => {
  let checkedOut = false;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'operations-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer operations-browser');
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: {
              name: 'Staff',
              permission_type: 'custom',
              permissions: ['stays', 'stay-bookings', 'stay-bookings.view'],
            },
          },
        },
      });
    if (url.pathname.endsWith('/admin/stays'))
      return route.fulfill({ json: { data: [stay], meta } });
    if (url.pathname.endsWith('/operations')) {
      expect(url.searchParams.get('date')).toBe('2030-01-02');
      const view = url.searchParams.get('view') || 'arrivals';
      const arrived = {
        ...operations.data[0],
        attendance_status: 'checked_in',
        checked_in_at: '2030-01-01T10:00:00Z',
      };
      return route.fulfill({
        json: {
          ...operations,
          data: checkedOut ? [] : [view === 'arrivals' ? operations.data[0] : arrived],
          meta: { ...meta, total: checkedOut ? 0 : 1 },
          context: {
            ...operations.context,
            view,
            counts: {
              ...operations.context.counts,
              in_house: checkedOut ? 0 : 1,
              overdue: checkedOut ? 0 : 1,
            },
          },
        },
      });
    }
    throw new Error('Unexpected ' + url.pathname);
  });
  await page.goto('/staff/stay-operations');
  await page.getByRole('combobox', { name: 'Operations stay', exact: true }).selectOption('1');
  await page.getByLabel('Scheduled date', { exact: true }).fill('2030-01-02');
  await page.getByRole('button', { name: 'Show operations', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Operations guest — Deluxe #51', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Overdue check-outs now (1)', exact: true }).click();
  await expect(page.getByText(/Live attendance as of/)).toBeVisible();
  await expect(page).toHaveURL(/view=overdue/);
  await page.reload();
  await expect(page.getByLabel('Scheduled date', { exact: true })).toHaveValue('2030-01-02');
  await expect(
    page.getByRole('button', { name: 'Overdue check-outs now (1)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  checkedOut = true;
  await page.getByRole('button', { name: 'Refresh operations', exact: true }).click();
  await expect(
    page.getByText('No bookings in this operations queue.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Overdue check-outs now (0)', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
