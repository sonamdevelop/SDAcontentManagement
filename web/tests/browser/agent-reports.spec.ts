import { test, expect } from '@playwright/test';
import { agentReport, reportStaff, reportCsv, csvHeaders } from '../agent-report-fixtures';
test('agent report dates and timezone survive reload and download a scoped CSV without pagination', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.staff.token', 'report-staff');
    sessionStorage.setItem('sda.customer.token', 'customer-private');
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer report-staff');
    if (u.pathname.endsWith('/auth/me')) return route.fulfill({ json: { data: reportStaff } });
    if (u.pathname.endsWith('/agents/export')) {
      expect(u.searchParams.get('timezone')).toBe('UTC');
      expect(u.searchParams.has('page')).toBe(false);
      return route.fulfill({ body: reportCsv, headers: csvHeaders });
    }
    if (u.pathname.endsWith('/reports/agents'))
      return route.fulfill({
        json: {
          ...agentReport,
          meta: {
            ...agentReport.meta,
            current_page: Number(u.searchParams.get('page') || 1),
            period: { from: '2026-06-10', to: '2026-06-11', timezone: 'UTC' },
          },
        },
      });
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/staff/agent-reports?from=2026-06-10&to=2026-06-11&timezone=UTC');
  await expect(
    page.getByRole('heading', { name: 'Asha Agent · Agent #7', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(page.getByLabel('Report timezone', { exact: true })).toHaveValue('UTC');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered agents CSV', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('sda-agent-report-2026-11-04.csv');
  const stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain('Asha Agent');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('lead-only report reader sees unavailable visit metrics without a zero-valued visit chart', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'report-staff'));
  await page.route('**/api/v1/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/auth/me')) return route.fulfill({ json: { data: reportStaff } });
    if (u.pathname.endsWith('/reports/agents'))
      return route.fulfill({
        json: {
          ...agentReport,
          data: [{ ...agentReport.data[0], site_visits: null }],
          meta: { ...agentReport.meta, available_sections: ['leads'] },
        },
      });
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/staff/agent-reports');
  await expect(
    page.getByText('Visit metrics are unavailable for this account.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Visit outcomes/ })).toHaveCount(0);
  await expect(page.getByRole('img', { name: /Lead outcomes/ })).toBeVisible();
});
