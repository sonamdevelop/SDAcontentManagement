import { test, expect } from '@playwright/test';
import { customer } from '../customer-fixtures';
import { reservedBooking } from '../reservation-fixtures';
import {
  cancellation,
  reviewedCancellation,
  cancellationStaff,
  cancellationMeta,
} from '../cancellation-fixtures';
test('customer sends one reviewed cancellation request with the same UUID on retry', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  let sent = false;
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.customer.token', 'customer-private');
    sessionStorage.setItem('sda.staff.token', 'staff-private');
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    expect(req.headers().authorization).toBe('Bearer customer-private');
    if (path.endsWith('/customer/me')) return route.fulfill({ json: { data: customer } });
    if (path.endsWith('/cancellation-requests')) {
      bodies.push(req.postDataJSON());
      sent = true;
      if (bodies.length === 1) return route.abort('failed');
      return route.fulfill({ json: { data: cancellation } });
    }
    if (path.endsWith('/customer/bookings/51'))
      return route.fulfill({
        json: { data: { ...reservedBooking, cancellation_requests: sent ? [cancellation] : [] } },
      });
    throw new Error('Unexpected ' + path);
  });
  await page.goto('/account/bookings/51');
  await page.getByLabel('Cancellation request reason', { exact: true }).fill(cancellation.reason);
  await page.getByRole('button', { name: 'Review cancellation request', exact: true }).click();
  expect(bodies).toHaveLength(0);
  await page.getByRole('button', { name: 'Send cancellation request', exact: true }).click();
  await page.getByRole('button', { name: 'Retry same cancellation request', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Request #8: Pending', exact: true }),
  ).toBeVisible();
  expect(bodies[1]).toEqual(bodies[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('staff rejects with a customer-visible response and retains filters across reload', async ({
  page,
}) => {
  let done = false;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'staff-private'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer staff-private');
    if (u.pathname.endsWith('/auth/me'))
      return route.fulfill({ json: { data: cancellationStaff } });
    if (u.pathname.endsWith('/decision')) {
      expect(req.postDataJSON()).toEqual({
        decision: 'reject',
        decision_reason: 'Please contact the stay team',
      });
      done = true;
      return route.fulfill({
        json: {
          data: {
            ...reviewedCancellation,
            status: 'rejected',
            decision_reason: 'Please contact the stay team',
          },
        },
      });
    }
    if (u.pathname.endsWith('/stay-cancellation-requests'))
      return route.fulfill({
        json: {
          data: done ? [] : [cancellation],
          meta: { ...cancellationMeta, total: done ? 0 : 1 },
        },
      });
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/staff/stay-cancellation-requests?booking_id=51&status=pending');
  await page.getByLabel('Cancellation decision', { exact: true }).selectOption('reject');
  await page
    .getByLabel('Customer-visible decision reason', { exact: true })
    .fill('Please contact the stay team');
  await page.getByRole('button', { name: 'Review cancellation decision', exact: true }).click();
  await expect(
    page.getByText('Reject: keep this booking confirmed and its rooms allocated.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm cancellation decision', exact: true }).click();
  await expect(
    page.getByText('No cancellation requests match these filters.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Request booking ID', { exact: true })).toHaveValue('51');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
