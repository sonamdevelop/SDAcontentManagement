import { test, expect } from '@playwright/test';
import { statement } from '../statement-fixtures';
test('prints a complete statement with shell controls hidden and retains exact balances after reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.staff.token', 'statement-browser');
    window.print = () => {
      document.body.dataset.printed = 'yes';
    };
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer statement-browser');
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
              permissions: ['stay-bookings.view', 'stay-bookings.payments'],
            },
          },
        },
      });
    if (url.pathname.endsWith('/statement')) return route.fulfill({ json: { data: statement } });
    throw new Error('Unexpected ' + url.pathname);
  });
  await page.goto('/staff/stay-bookings/51/statement');
  await expect(
    page.getByRole('heading', { name: 'Stay booking statement #51', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('₹3,900.99', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Print statement', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-printed', 'yes');
  await page.emulateMedia({ media: 'print' });
  await expect(
    page.getByRole('navigation', { name: 'Staff navigation', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print statement', exact: true })).toBeHidden();
  await expect(page.getByRole('article', { name: 'Booking statement', exact: true })).toBeVisible();
  await expect(page.getByText('₹3,900.99', { exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Print statement', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
