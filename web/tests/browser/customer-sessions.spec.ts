import { test, expect } from '@playwright/test';
import { customer } from '../customer-fixtures';
import { sessionPage, onlyCurrent } from '../customer-session-fixtures';
test('customer confirms a device sign-out and retains both current customer and staff sessions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.customer.token', 'customer-session');
    sessionStorage.setItem('sda.staff.token', 'staff-secret');
  });
  let deleted = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer customer-session');
    if (u.pathname.endsWith('/customer/me')) return route.fulfill({ json: { data: customer } });
    if (u.pathname.endsWith('/customer/sessions/8') && req.method() === 'DELETE') {
      expect(req.postDataJSON()).toEqual({ current_password: 'CustomerPass123!' });
      deleted = true;
      return route.fulfill({ status: 204 });
    }
    if (u.pathname.endsWith('/customer/sessions'))
      return route.fulfill({ json: deleted ? onlyCurrent : sessionPage });
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/account/sessions');
  await expect(page.getByRole('heading', { name: 'Customer web · This device' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out device My phone' }).click();
  expect(deleted).toBe(false);
  await page.getByLabel('Confirm current customer password').fill('CustomerPass123!');
  await page.getByRole('button', { name: 'Confirm sign out device', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My phone', exact: true })).toHaveCount(0);
  await expect(page.getByText(/Device sign-out confirmed/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Customer web · This device' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('sda.staff.token'))).toBe('staff-secret');
  expect(await page.evaluate(() => sessionStorage.getItem('sda.customer.token'))).toBe(
    'customer-session',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
