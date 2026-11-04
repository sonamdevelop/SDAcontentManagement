import { test, expect } from '@playwright/test';
test('real customer signs out one and all other device tokens without ending current customer or staff access', async ({
  page,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const staffToken = await page.evaluate(() => sessionStorage.getItem('sda.staff.token'));
  const email = `session-${Date.now()}@example.test`,
    password = 'CustomerPass123!';
  const registered = await page.request.post('/api/v1/customer/auth/register', {
    data: {
      name: 'Session acceptance customer',
      email,
      password,
      password_confirmation: password,
      device_name: 'Current web',
    },
  });
  expect(registered.status()).toBe(201);
  const current = (await registered.json()).data.access_token;
  async function login(device_name: string) {
    const r = await page.request.post('/api/v1/customer/auth/login', {
      data: { email, password, device_name },
    });
    expect(r.status()).toBe(201);
    return (await r.json()).data.access_token;
  }
  const phone = await login('Acceptance phone'),
    tablet = await login('Acceptance tablet');
  await page.evaluate((token) => sessionStorage.setItem('sda.customer.token', token), current);
  await page.goto('/account/sessions');
  await expect(page.getByRole('heading', { name: 'Current web · This device' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out device Acceptance phone', exact: true }).click();
  await page.getByLabel('Confirm current customer password').fill(password);
  await page.getByRole('button', { name: 'Confirm sign out device', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceptance phone', exact: true })).toHaveCount(0);
  expect(
    (
      await page.request.get('/api/v1/customer/me', {
        headers: { Authorization: `Bearer ${phone}` },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.get('/api/v1/customer/me', {
        headers: { Authorization: `Bearer ${tablet}` },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: 'Sign out other devices', exact: true }).click();
  await page.getByLabel('Confirm current customer password').fill(password);
  await page.getByRole('button', { name: 'Confirm sign out other devices', exact: true }).click();
  await expect(page.getByText('Page 1 of 1 · 1 records')).toBeVisible();
  expect(
    (
      await page.request.get('/api/v1/customer/me', {
        headers: { Authorization: `Bearer ${tablet}` },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.get('/api/v1/customer/me', {
        headers: { Authorization: `Bearer ${current}` },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.get('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${staffToken}` },
      })
    ).status(),
  ).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Current web · This device' })).toBeVisible();
});
