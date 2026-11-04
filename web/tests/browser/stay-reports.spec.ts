import { test, expect } from '@playwright/test';
import { stay, stayMeta } from '../stay-fixtures';
import { stayReport, stayReportStaff, reportPath } from '../stay-report-fixtures';
test('stay occupancy and cash report retains dates on reload and fits the screen', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.staff.token', 'finance-token');
    sessionStorage.setItem('sda.customer.token', 'customer-secret');
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      u = new URL(request.url());
    expect(request.headers().authorization).toBe('Bearer finance-token');
    if (u.pathname.endsWith('/auth/me')) return route.fulfill({ json: { data: stayReportStaff } });
    if (u.pathname.endsWith('/admin/stays'))
      return route.fulfill({ json: { data: [stay], meta: stayMeta } });
    if (u.pathname.endsWith('/stays/1/report')) {
      expect(u.searchParams.get('from')).toBe('2030-01-02');
      return route.fulfill({ json: stayReport });
    }
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto(reportPath);
  await expect(page.getByText(/Net movement: -60.01/)).toBeVisible();
  await expect(page.getByText(/Above current capacity/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Report until (exclusive)')).toHaveValue('2030-01-04');
  await expect(page.getByRole('meter')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
