import { test, expect } from '@playwright/test';
import { finance, financialBooking, opening } from '../payment-fixtures';
import type { PaymentEntry } from '../../src/staff/payments';
test('records, safely retries, refunds and corrects offline financial entries', async ({
  page,
}) => {
  let summary = { ...finance },
    entries: PaymentEntry[] = [opening],
    attempts = 0;
  let paymentPayload: unknown;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'ledger-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    expect(req.headers().authorization).toBe('Bearer ledger-browser');
    expect(req.headers().cookie).toBeUndefined();
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
    if (path.endsWith('/stay-bookings/51'))
      return route.fulfill({ json: { data: { ...financialBooking, ...summary } } });
    if (path.endsWith('/51/payments') && req.method() === 'GET')
      return route.fulfill({
        json: {
          data: entries,
          summary,
          meta: { current_page: 1, last_page: 1, total: entries.length },
        },
      });
    if (path.endsWith('/51/payments') && req.method() === 'POST') {
      attempts++;
      const data = req.postDataJSON();
      expect(data).toMatchObject({ amount: '3900.99', method: 'cash' });
      const entry = {
        ...opening,
        id: 2,
        kind: 'payment' as const,
        amount: '3900.99',
        method: 'cash',
        reference: null,
      };
      summary = { ...finance, received_total: '4001.00', net_paid: '4001.00', balance: '0.00' };
      entries = [entry, opening];
      if (attempts === 1) {
        paymentPayload = data;
        return route.abort('failed');
      }
      expect(data).toEqual(paymentPayload);
      return route.fulfill({ json: { data: entry, summary } });
    }
    if (path.endsWith('/51/refunds')) {
      const data = req.postDataJSON();
      expect(data).toMatchObject({ amount: '25.25', reason: 'Partial offline refund' });
      const entry = {
        ...opening,
        id: 3,
        kind: 'refund' as const,
        amount: '25.25',
        method: 'cash',
        reason: data.reason,
        reference: null,
      };
      entries = [entry, ...entries];
      summary = { ...summary, refunded_total: '25.25', net_paid: '3975.75', balance: '25.25' };
      return route.fulfill({ json: { data: entry, summary } });
    }
    if (path.endsWith('/payments/3/reverse')) {
      const data = req.postDataJSON();
      expect(data.reason).toBe('Refund was entered incorrectly');
      const entry = {
        ...opening,
        id: 4,
        kind: 'reversal' as const,
        amount: '25.25',
        method: 'cash',
        reason: data.reason,
        reversal_of: 3,
        reference: null,
      };
      entries = [entry, ...entries.map((e) => (e.id === 3 ? { ...e, reversed_by: 4 } : e))];
      summary = { ...summary, refunded_total: '0.00', net_paid: '4001.00', balance: '0.00' };
      return route.fulfill({ json: { data: entry, summary } });
    }
    throw new Error(`Unexpected ${req.method()} ${path}`);
  });
  await page.goto('/staff/stay-bookings/51');
  await page.getByRole('button', { name: 'Record payment', exact: true }).click();
  await page.getByLabel('Ledger amount', { exact: true }).fill('3900.99');
  await page.getByRole('button', { name: 'Review entry', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm financial entry', exact: true }).click();
  await expect(page.getByText(/Outcome uncertain. Retry this same financial entry/)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Close financial form', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh ledger', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment #2', exact: true })).toBeVisible();
  await expect(page.getByLabel('Ledger amount', { exact: true })).toHaveValue('3900.99');
  await page.getByRole('button', { name: 'Confirm financial entry', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
  await page.getByRole('button', { name: 'Record refund', exact: true }).click();
  await page.getByLabel('Ledger amount', { exact: true }).fill('25.25');
  await page.getByLabel('Ledger reason *', { exact: true }).fill('Partial offline refund');
  await page.getByRole('button', { name: 'Review entry', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm financial entry', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Refund #3', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Correct entry #3', exact: true }).click();
  await page.getByLabel('Ledger reason *', { exact: true }).fill('Refund was entered incorrectly');
  await page.getByRole('button', { name: 'Review entry', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm financial entry', exact: true }).click();
  await expect(page.getByText('Reversed by entry #4', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Refund #3', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reversal #4', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('ledger readers see immutable history without financial write actions', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'ledger-reader'));
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Reader',
            email: 'reader@example.test',
            role: {
              name: 'Reader',
              permission_type: 'custom',
              permissions: ['stay-bookings.view', 'stay-bookings.payments'],
            },
          },
        },
      });
    if (path.endsWith('/payments'))
      return route.fulfill({
        json: {
          data: [opening],
          summary: finance,
          meta: { current_page: 1, last_page: 1, total: 1 },
        },
      });
    return route.fulfill({ json: { data: financialBooking } });
  });
  await page.goto('/staff/stay-bookings/51');
  await expect(
    page.getByRole('heading', { name: 'Opening advance #1', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record refund', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Correct entry #1', exact: true })).toHaveCount(0);
});
