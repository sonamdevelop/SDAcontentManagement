import { test, expect } from '@playwright/test';
import { stay, stayMeta as meta } from '../stay-fixtures';
import { followUps, refundRow } from '../payment-followup-fixtures';
test('reviews collection and refund queues, retains URL filters and refreshes settled balances', async ({
  page,
}) => {
  let settled = false;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'finance-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer finance-browser');
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: {
              name: 'Finance',
              permission_type: 'custom',
              permissions: [
                'stays',
                'stay-bookings',
                'stay-bookings.view',
                'stay-bookings.payments',
              ],
            },
          },
        },
      });
    if (url.pathname.endsWith('/admin/stays'))
      return route.fulfill({ json: { data: [stay], meta } });
    if (url.pathname.endsWith('/payment-follow-ups')) {
      const view = url.searchParams.get('view') || 'collection';
      return route.fulfill({
        json: {
          ...followUps,
          data: settled ? [] : [view === 'refund' ? refundRow : followUps.data[0]],
          meta: { ...meta, total: settled ? 0 : 1 },
          context: {
            ...followUps.context,
            view,
            counts: { collection: 1, refund: settled ? 0 : 1 },
          },
        },
      });
    }
    throw new Error('Unexpected ' + url.pathname);
  });
  await page.goto('/staff/stay-payment-follow-ups');
  await page
    .getByRole('combobox', { name: 'Payment follow-up stay', exact: true })
    .selectOption('1');
  await page.getByRole('button', { name: 'Show payment follow-up', exact: true }).click();
  await expect(page.getByText('Pending collection: ₹0.01', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pending refund (1)', exact: true }).click();
  await expect(page.getByText('Pending refund: ₹74.99', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Finance guest — Deluxe #51', exact: true }),
  ).toHaveAttribute('href', '/staff/stay-bookings/51');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Pending refund (1)', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  settled = true;
  await page.getByRole('button', { name: 'Refresh payment follow-up', exact: true }).click();
  await expect(page.getByText('No bookings in this payment queue.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
