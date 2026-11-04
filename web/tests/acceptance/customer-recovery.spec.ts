import { test, expect } from '@playwright/test';
import { capturedMailLink } from './mail';
test('real captured email verifies and recovers customer account without resetting the staff session', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create customer account', exact: true }).click();
  const email = `recovery-${Date.now()}@example.test`;
  await page.getByLabel('Customer name', { exact: true }).fill('Recovery customer');
  await page.getByLabel('Customer email', { exact: true }).fill(email);
  await page.getByLabel('Customer password', { exact: true }).fill('OriginalPass123!');
  await page.getByLabel('Confirm customer password', { exact: true }).fill('OriginalPass123!');
  await page.getByRole('button', { name: 'Register customer', exact: true }).click();
  await page.getByRole('button', { name: 'Send verification email', exact: true }).click();
  const verify = await capturedMailLink(email, 'verify');
  await page.goto(verify);
  await expect(page).not.toHaveURL(/#token=/);
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Email verified. Return to your account to refresh its status.',
  );
  await page.getByRole('link', { name: 'Back to customer account', exact: true }).click();
  await expect(page.getByText('Email verified.', { exact: true })).toBeVisible();
  const old = await page.evaluate(() => sessionStorage.getItem('sda.customer.token'));
  await page.evaluate(() => sessionStorage.setItem('sda.staff.token', 'staff-capture-sentinel'));
  await page.goto('/account/forgot');
  await page.getByLabel('Recovery email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Send password reset email', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('If the account is eligible');
  const reset = await capturedMailLink(email, 'reset');
  await page.goto(reset);
  await expect(page).not.toHaveURL(/#token=/);
  await page.getByLabel('New recovery password', { exact: true }).fill('RecoveredPass456!');
  await page.getByLabel('Confirm recovery password', { exact: true }).fill('RecoveredPass456!');
  await page.getByRole('button', { name: 'Save recovered password', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Password reset. Sign in again with your new password.',
  );
  expect(await page.evaluate(() => sessionStorage.getItem('sda.staff.token'))).toBe(
    'staff-capture-sentinel',
  );
  const revoked = await page.request.get('http://127.0.0.1:8082/api/v1/customer/me', {
    headers: { Authorization: `Bearer ${old}` },
  });
  expect(revoked.status()).toBe(401);
  await page.getByRole('link', { name: 'Back to customer account', exact: true }).click();
  await page.getByLabel('Customer email', { exact: true }).fill(email);
  await page.getByLabel('Customer password', { exact: true }).fill('RecoveredPass456!');
  await page.getByRole('button', { name: 'Sign in customer', exact: true }).click();
  await expect(page.getByText('Email verified.', { exact: true })).toBeVisible();
  await page.goto(reset);
  await page.getByLabel('New recovery password', { exact: true }).fill('AnotherPass789!');
  await page.getByLabel('Confirm recovery password', { exact: true }).fill('AnotherPass789!');
  await page.getByRole('button', { name: 'Save recovered password', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('invalid, expired or already used');
  expect(errors).toEqual([]);
});
