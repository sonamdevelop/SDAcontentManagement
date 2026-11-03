import { test, expect } from '@playwright/test';
test('real customer registration/profile/password and empty owned booking list preserve the staff session', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create customer account', exact: true }).click();
  const email = `customer-acceptance-${Date.now()}@example.test`;
  await page.getByLabel('Customer name', { exact: true }).fill('Synthetic Customer');
  await page.getByLabel('Customer email', { exact: true }).fill(email);
  await page.getByLabel('Customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByLabel('Confirm customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByRole('button', { name: 'Register customer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'My customer account', exact: true }),
  ).toBeVisible();
  const oldToken = await page.evaluate(() => sessionStorage.getItem('sda.customer.token')!);
  await page.getByLabel('Profile name', { exact: true }).fill('Updated Synthetic Customer');
  await page.getByLabel('Profile phone', { exact: true }).fill('+91 9000000000');
  await page.getByRole('button', { name: 'Save customer profile', exact: true }).click();
  await expect(
    page.getByText('Signed in as Updated Synthetic Customer', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'My bookings', exact: true }).click();
  await expect(
    page.getByText(
      'No bookings are linked to your account yet. For an existing booking, contact the stay team.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Change password', exact: true }).click();
  await page.getByLabel('Current customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByLabel('New customer password', { exact: true }).fill('ReplacementPass456!');
  await page
    .getByLabel('Confirm new customer password', { exact: true })
    .fill('ReplacementPass456!');
  await page.getByRole('button', { name: 'Update customer password', exact: true }).click();
  await expect(
    page.getByText('Password changed. Sign in with your new password.', { exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.get('/api/v1/customer/me', {
        headers: { Authorization: `Bearer ${oldToken}` },
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel('Customer email', { exact: true }).fill(email);
  await page.getByLabel('Customer password', { exact: true }).fill('ReplacementPass456!');
  await page.getByRole('button', { name: 'Sign in customer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'My customer account', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out customer', exact: true }).click();
  await expect(page.getByText('Signed out.', { exact: true })).toBeVisible();
  await page.goto('/staff');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
