import { test, expect } from '@playwright/test';
import { property } from '../fixtures';
const admin = {
  ...property(),
  address: 'River road',
  owner_name: 'Owner',
  owner_phone: null,
  postal_code: null,
  is_published: false,
  image_paths: [],
};
test('staff login, multipart edit, private records and logout work across screen sizes', async ({
  page,
}) => {
  let saved = false;
  let expired = false;
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    expect(request.headers().cookie).toBeUndefined();
    if (path === '/api/v1/auth/login') {
      expect(request.headers().authorization).toBeUndefined();
      await route.fulfill({ status: 201, json: { data: { access_token: 'browser-staff-token' } } });
      return;
    }
    expect(request.headers().authorization).toBe('Bearer browser-staff-token');
    if (path === '/api/v1/auth/me') {
      await route.fulfill(
        expired
          ? { status: 401, json: {} }
          : {
              json: {
                data: {
                  id: 1,
                  name: 'Test Agent',
                  email: 'agent@example.test',
                  role: { name: 'Staff', permission_type: 'all', permissions: [] },
                },
              },
            },
      );
      return;
    }
    if (path === '/api/v1/auth/logout') {
      expired = true;
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === '/api/v1/admin/reports/overview') {
      await route.fulfill({
        json: {
          data: { properties: { total: 1 }, enquiries: null },
          meta: { as_of: '2026-11-01', period: { timezone: 'UTC' } },
        },
      });
      return;
    }
    if (path === '/api/v1/admin/properties/7' && request.method() === 'POST') {
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      const body = request.postDataBuffer()!.toString();
      expect(body).toContain('name="_method"\r\n\r\nPUT');
      expect(body).toContain('filename="photo.png"');
      expect(body).toContain('Updated staff property');
      saved = true;
      await route.fulfill({ json: { data: admin } });
      return;
    }
    if (path === '/api/v1/admin/properties/7') {
      await route.fulfill({ json: { data: admin } });
      return;
    }
    if (path === '/api/v1/admin/properties') {
      await route.fulfill({
        json: {
          data: [{ ...admin, title: saved ? 'Updated staff property' : admin.title }],
          meta: { current_page: 1, last_page: 1, total: 1 },
        },
      });
      return;
    }
    if (path === '/api/v1/admin/enquiries') {
      await route.fulfill({
        json: {
          data: [
            {
              id: 1,
              property_title: 'River home',
              name: 'Buyer',
              email: 'buyer@example.test',
              message: 'Please arrange a visit',
              lead_id: null,
              created_at: '2026-11-01',
            },
          ],
          meta: { current_page: 1, last_page: 1, total: 1 },
        },
      });
      return;
    }
    await route.fulfill({ status: 403, json: {} });
  });
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('agent@example.test');
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Not available for your account')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Staff navigation' })
    .getByRole('link', { name: 'Properties', exact: true })
    .click();
  await page.getByRole('link', { name: 'Edit property', exact: true }).click();
  await page.getByLabel('Title *', { exact: true }).fill('Updated staff property');
  await page.getByLabel('Published on website').check();
  await page.getByLabel('Add photos', { exact: true }).setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updated staff property' })).toBeVisible();
  expect(saved).toBe(true);
  await page.getByRole('link', { name: 'Enquiries', exact: true }).click();
  await expect(page.getByText(/buyer@example.test/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
});
