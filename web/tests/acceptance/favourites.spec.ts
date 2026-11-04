import { test, expect } from '@playwright/test';
test('real customer saves a reviewed property, sees aggregate popularity, and removes it safely after content is hidden', async ({
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
    ['Title *', 'Favourite acceptance home'],
    ['Price (INR) *', '4500000.25'],
    ['Area *', '1200'],
    ['Address *', 'Private favourite address'],
    ['City *', 'Favourite test city'],
    ['State *', 'Karnataka'],
    ['Owner name *', 'Private favourite owner'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Published on website').check();
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/admin/properties') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  const p = (await (await created).json()).data;
  await page.goto(`/staff/properties/${p.id}/moderation`);
  await page.getByLabel('Moderation reason', { exact: true }).fill('Reviewed favourite fixture');
  await page.getByRole('button', { name: 'Review moderation decision', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm moderation action', exact: true }).click();
  await expect(page.getByText('Moderation: Approved · Revision 1', { exact: true })).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Create customer account', exact: true }).click();
  await page.getByLabel('Customer name', { exact: true }).fill('Favourite customer');
  await page
    .getByLabel('Customer email', { exact: true })
    .fill(`favourite-${Date.now()}@example.test`);
  await page.getByLabel('Customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByLabel('Confirm customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByRole('button', { name: 'Register customer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'My customer account', exact: true }),
  ).toBeVisible();
  await page.goto(`/properties/${p.id}`);
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove saved property', exact: true }),
  ).toBeVisible();
  await page.goto(`/staff/property-favourites?property_id=${p.id}`);
  await expect(page.getByText('Saved by 1 customer', { exact: true })).toBeVisible();
  await page.goto(`/staff/properties/${p.id}/edit`);
  await page.getByLabel('Title *', { exact: true }).fill('Unreviewed secret favourite title');
  const edited = page.waitForResponse(
    (r) => r.url().endsWith('/admin/properties/' + p.id) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await edited;
  await page.goto('/account/favourites');
  await expect(
    page.getByText('This saved property is currently unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Unreviewed secret favourite title', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove saved property', exact: true }).click();
  await expect(page.getByText('You have no saved properties yet.', { exact: true })).toBeVisible();
  await page.goto(`/staff/property-favourites?property_id=${p.id}`);
  await expect(
    page.getByText('No properties match these popularity filters.', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
