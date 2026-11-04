import { test, expect } from '@playwright/test';
import {
  moderationDetail,
  approvedModeration,
  moderationStaff,
  moderationRow,
  moderationMeta,
} from '../moderation-fixtures';
test('reviewer inspects content and retries the same revision-bound approval after an uncertain response', async ({
  page,
}) => {
  const bodies: unknown[] = [];
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'reviewer-private'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer reviewer-private');
    if (u.pathname.endsWith('/auth/me')) return route.fulfill({ json: { data: moderationStaff } });
    if (u.pathname.endsWith('/moderation') && req.method() === 'PATCH') {
      bodies.push(req.postDataJSON());
      if (bodies.length === 1) return route.abort('failed');
      return route.fulfill({ json: { data: approvedModeration } });
    }
    if (u.pathname.endsWith('/moderation'))
      return route.fulfill({ json: { data: moderationDetail } });
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/staff/properties/7/moderation');
  await page.getByLabel('Moderation reason', { exact: true }).fill('Reviewed listing');
  await page.getByRole('button', { name: 'Review moderation decision', exact: true }).click();
  expect(bodies).toHaveLength(0);
  await expect(
    page.getByText('Property #7 · Revision 1 · River view apartment', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Confirm moderation action', exact: true }).click();
  await page.getByRole('button', { name: 'Retry same moderation action', exact: true }).click();
  await expect(page.getByText('Moderation: Approved · Revision 1', { exact: true })).toBeVisible();
  expect(bodies[1]).toEqual(bodies[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('property reader browses review filters and snapshots without decision controls', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'reader-private'));
  await page.route('**/api/v1/**', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            ...moderationStaff,
            role: { name: 'Reader', permission_type: 'custom', permissions: ['properties'] },
          },
        },
      });
    if (u.pathname.endsWith('/property-moderation'))
      return route.fulfill({ json: { data: [moderationRow], meta: moderationMeta } });
    if (u.pathname.endsWith('/moderation'))
      return route.fulfill({ json: { data: moderationDetail } });
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/staff/property-moderation?status=pending&property_id=7');
  await expect(page.getByLabel('Moderation property ID', { exact: true })).toHaveValue('7');
  await page.reload();
  await page.getByRole('link', { name: 'River view apartment', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Current public content', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review moderation decision', exact: true }),
  ).toHaveCount(0);
  await page.getByText('View reviewed content snapshot', { exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'River view apartment', exact: true }),
  ).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
