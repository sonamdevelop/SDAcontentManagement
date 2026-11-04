import { test, expect } from '@playwright/test';
test('real property review rejects resubmits approves and hides edited content until fresh revision approval', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto('/staff/properties/new');
  for (const [label, value] of [
    ['Title *', 'Moderation acceptance home'],
    ['Price (INR) *', '5500000.25'],
    ['Area *', '1200'],
    ['Address *', 'Private moderation address'],
    ['City *', 'Moderation test city'],
    ['State *', 'Karnataka'],
    ['Owner name *', 'Private moderation owner'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Published on website').check();
  await page.getByLabel('Accept enquiries').check();
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/admin/properties') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  const p = (await (await created).json()).data;
  expect(p.moderation_status).toBe('pending');
  expect((await page.request.get(`/api/v1/properties/${p.id}`)).status()).toBe(404);
  await page.goto(`/staff/properties/${p.id}/moderation`);
  async function decision(value: 'approved' | 'rejected', reason: string) {
    await page.getByLabel('Moderation decision', { exact: true }).selectOption(value);
    await page.getByLabel('Moderation reason', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Review moderation decision', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm moderation action', exact: true }).click();
    await expect(page.getByText(`Review reason: ${reason}`, { exact: true })).toBeVisible();
  }
  await decision('rejected', 'Please double-check the description');
  await page
    .getByLabel('Resubmission note', { exact: true })
    .fill('Description checked, please reconsider');
  await page.getByRole('button', { name: 'Review resubmission', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm moderation action', exact: true }).click();
  await expect(page.getByText('Moderation: Pending · Revision 2', { exact: true })).toBeVisible();
  await decision('approved', 'Reviewed all public content');
  expect((await page.request.get(`/api/v1/properties/${p.id}`)).status()).toBe(200);
  await page.getByRole('link', { name: 'Edit listing content', exact: true }).click();
  await page.getByLabel('Title *', { exact: true }).fill('Revised moderation home');
  const updated = page.waitForResponse(
    (r) => r.url().endsWith('/admin/properties/' + p.id) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  expect((await (await updated).json()).data.moderation_revision).toBe(3);
  expect((await page.request.get(`/api/v1/properties/${p.id}`)).status()).toBe(404);
  const token = await page.evaluate(() => sessionStorage.getItem('sda.staff.token'));
  const stale = await page.request.patch(`/api/v1/admin/properties/${p.id}/moderation`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { expected_revision: 2, decision: 'approved', reason: 'Reviewed all public content' },
  });
  expect(stale.status()).toBe(409);
  await page.goto(`/staff/properties/${p.id}/moderation`);
  await decision('approved', 'Reviewed revised public title');
  await expect(
    page.getByRole('heading', { name: 'Revision 3: Content changed', exact: true }),
  ).toBeVisible();
  await page.goto(`/properties/${p.id}`);
  await expect(
    page.getByRole('heading', { name: 'Revised moderation home', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Private moderation address', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
