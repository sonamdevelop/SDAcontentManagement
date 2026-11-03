import { test, expect } from '@playwright/test';
import { publicStay, editableStay } from '../stay-content-fixtures';
test('explores public stays and filters across URL reloads without sending staff credentials', async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'private-token'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBeUndefined();
    expect(req.headers().cookie).toBeUndefined();
    if (url.pathname.endsWith('/stays'))
      return route.fulfill({
        json: { data: [publicStay], meta: { current_page: 1, last_page: 1, total: 1 } },
      });
    if (url.pathname.endsWith('/stays/1')) return route.fulfill({ json: { data: publicStay } });
    throw new Error('Unexpected ' + url.pathname);
  });
  await page.goto('/stays');
  await page.getByLabel('Stay city', { exact: true }).fill('Dandeli');
  await page.getByRole('button', { name: 'Filter stays', exact: true }).click();
  await expect(page).toHaveURL(/city=Dandeli/);
  await page.reload();
  await expect(page.getByLabel('Stay city', { exact: true })).toHaveValue('Dandeli');
  await page.getByRole('link', { name: 'River stay', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Room types', exact: true })).toBeVisible();
  await expect(page.getByText('Forest view', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to stays', exact: true }).click();
  await expect(page).toHaveURL(/city=Dandeli/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('edits stay and room publication separately and refreshes the saved draft', async ({
  page,
}) => {
  let current = structuredClone(editableStay),
    saves = 0;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'content-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer content-browser');
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: {
              name: 'Manager',
              permission_type: 'custom',
              permissions: ['stays', 'stays.manage'],
            },
          },
        },
      });
    if (url.pathname.endsWith('/content')) {
      if (req.method() === 'POST') {
        saves++;
        current = { ...current, is_published: true, description: 'Published riverside stay' };
        return route.fulfill({ json: { data: current } });
      }
      return route.fulfill({ json: { data: current } });
    }
    throw new Error('Unexpected ' + url.pathname);
  });
  await page.goto('/staff/stays/1/content');
  await page.getByLabel('Public description', { exact: true }).fill('Published riverside stay');
  await page.getByLabel('Published in stay catalogue', { exact: true }).check();
  await page.getByRole('button', { name: 'Save public content', exact: true }).click();
  await expect(page.getByLabel('Public description', { exact: true })).toHaveValue(
    'Published riverside stay',
  );
  expect(saves).toBe(1);
  await page.getByLabel('Content target', { exact: true }).selectOption('2');
  await expect(page.getByLabel('Published in stay catalogue', { exact: true })).not.toBeChecked();
  await expect(page).toHaveURL(/room_id=2/);
  await page.reload();
  await expect(page.getByLabel('Public description', { exact: true })).toHaveValue('Forest view');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
