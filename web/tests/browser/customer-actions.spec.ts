import { test, expect } from '@playwright/test';
import { customer } from '../customer-fixtures';
test('requests recovery then resets from a private fragment without sending stored bearer tokens', async ({
  page,
}) => {
  const token = 'b'.repeat(64),
    email = customer.email;
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.staff.token', 'staff-private');
    sessionStorage.setItem('sda.customer.token', 'customer-private');
  });
  let reset = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    expect(req.headers().authorization).toBeUndefined();
    expect(req.headers().cookie).toBeUndefined();
    if (path.endsWith('/forgot-password'))
      return route.fulfill({ status: 202, json: { message: 'Accepted' } });
    if (path.endsWith('/reset-password')) {
      expect(req.postDataJSON()).toMatchObject({ email, token, password: 'RecoveredPass456!' });
      reset = true;
      return route.fulfill({ status: 204 });
    }
    throw new Error('Unexpected request ' + path);
  });
  await page.goto('/account/forgot');
  await page.getByLabel('Recovery email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send password reset email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If the account is eligible');
  await page.goto('/account/reset#' + new URLSearchParams({ email, token }));
  await expect(page).toHaveURL(/\/account\/reset$/);
  await page.getByLabel('New recovery password', { exact: true }).fill('RecoveredPass456!');
  await page.getByLabel('Confirm recovery password', { exact: true }).fill('RecoveredPass456!');
  await page.getByRole('button', { name: 'Save recovered password', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Password reset. Sign in again with your new password.',
  );
  expect(reset).toBe(true);
  expect(await page.evaluate(() => sessionStorage.getItem('sda.staff.token'))).toBe(
    'staff-private',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('opens verification without a mutation until the customer explicitly confirms', async ({
  page,
}) => {
  let calls = 0;
  await page.route('**/api/v1/**', async (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    expect(new URL(route.request().url()).pathname).toBe('/api/v1/customer/auth/verify-email');
    calls++;
    return route.fulfill({ status: 204 });
  });
  await page.goto(
    '/account/verify#' + new URLSearchParams({ email: customer.email, token: 'c'.repeat(64) }),
  );
  await expect(page).toHaveURL(/\/account\/verify$/);
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Email verified. Return to your account to refresh its status.',
  );
  expect(calls).toBe(1);
});
