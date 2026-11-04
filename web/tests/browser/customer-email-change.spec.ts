import { test, expect } from '@playwright/test';
test('email-change confirmation uses a private fragment, explicit action and no stored bearer', async ({
  page,
}) => {
  const token = 'b'.repeat(64),
    email = 'new@example.test';
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.customer.token', 'customer-private');
    sessionStorage.setItem('sda.staff.token', 'staff-private');
  });
  let confirmed = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    expect(req.headers().authorization).toBeUndefined();
    expect(req.headers().cookie).toBeUndefined();
    expect(new URL(req.url()).pathname).toBe('/api/v1/customer/auth/change-email');
    expect(req.postDataJSON()).toEqual({ customer_id: 7, email, token });
    confirmed = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto(
    '/account/change-email#' + new URLSearchParams({ customer_id: '7', email, token }),
  );
  await expect(page).toHaveURL(/\/account\/change-email$/);
  expect(confirmed).toBe(false);
  await page.getByRole('button', { name: 'Confirm customer email change', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Email changed and verified.');
  expect(await page.evaluate(() => sessionStorage.getItem('sda.staff.token'))).toBe(
    'staff-private',
  );
  expect(await page.evaluate(() => sessionStorage.getItem('sda.customer.token'))).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
