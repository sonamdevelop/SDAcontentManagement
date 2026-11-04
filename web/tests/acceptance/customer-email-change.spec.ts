import { test, expect } from '@playwright/test';
import { capturedMailLink } from './mail';
test('real captured confirmation changes email, ends customer devices and preserves staff access and customer identity', async ({
  page,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const staff = await page.evaluate(() => sessionStorage.getItem('sda.staff.token'));
  const old = `email-old-${Date.now()}@example.test`,
    target = `email-new-${Date.now()}@example.test`,
    password = 'CustomerPass123!';
  const r = await page.request.post('/api/v1/customer/auth/register', {
    data: {
      name: 'Email change acceptance',
      email: old,
      password,
      password_confirmation: password,
    },
  });
  expect(r.status()).toBe(201);
  const current = (await r.json()).data.access_token;
  const before = await (
    await page.request.get('/api/v1/customer/me', {
      headers: { Authorization: `Bearer ${current}` },
    })
  ).json();
  const phoneResponse = await page.request.post('/api/v1/customer/auth/login', {
    data: { email: old, password, device_name: 'Phone' },
  });
  expect(phoneResponse.status()).toBe(201);
  const phone = (await phoneResponse.json()).data.access_token;
  await page.evaluate((token) => sessionStorage.setItem('sda.customer.token', token), current);
  await page.goto('/account/email');
  await page.getByLabel('New customer email', { exact: true }).fill(target);
  await page.getByLabel('Current customer password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Send new email confirmation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Pending new email', exact: true })).toBeVisible();
  const link = await capturedMailLink(target, 'change-email');
  expect(
    (
      await (
        await page.request.get('/api/v1/customer/me', {
          headers: { Authorization: `Bearer ${current}` },
        })
      ).json()
    ).data.email,
  ).toBe(old);
  await page.goto(link);
  await expect(page).toHaveURL(/\/account\/change-email$/);
  await page.getByRole('button', { name: 'Confirm customer email change', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email changed and verified.');
  for (const token of [current, phone])
    expect(
      (
        await page.request.get('/api/v1/customer/me', {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(401);
  expect(
    (
      await page.request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${staff}` } })
    ).status(),
  ).toBe(200);
  expect(
    (
      await page.request.post('/api/v1/customer/auth/login', { data: { email: old, password } })
    ).status(),
  ).toBe(401);
  await page.goto('/account');
  await page.getByLabel('Customer email', { exact: true }).fill(target);
  await page.getByLabel('Customer password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in customer', exact: true }).click();
  await expect(page.getByText('Email verified.', { exact: true })).toBeVisible();
  const afterToken = await page.evaluate(() => sessionStorage.getItem('sda.customer.token'));
  const after = await (
    await page.request.get('/api/v1/customer/me', {
      headers: { Authorization: `Bearer ${afterToken}` },
    })
  ).json();
  expect(after.data.id).toBe(before.data.id);
  expect(after.data.email).toBe(target);
  await page.goto(link);
  await page.getByRole('button', { name: 'Confirm customer email change', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(
    (
      await page.request.get('/api/v1/customer/me', {
        headers: { Authorization: `Bearer ${afterToken}` },
      })
    ).status(),
  ).toBe(200);
});
