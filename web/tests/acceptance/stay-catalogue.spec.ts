import { test, expect } from '@playwright/test';
test('real content publication, public stay discovery/photos and unpublication without staff credentials', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto('/staff/stays');
  await page.getByRole('button', { name: 'Add stay', exact: true }).click();
  await page.getByLabel('Stay name', { exact: true }).fill('Public catalogue acceptance stay');
  await page.getByLabel('Stay city', { exact: true }).fill('Dandeli');
  await page.getByRole('button', { name: 'Save stay', exact: true }).click();
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Public catalogue acceptance stay', exact: true }),
  });
  await card.getByRole('button', { name: 'Add room type', exact: true }).click();
  await card.getByLabel('Room type name', { exact: true }).fill('Public catalogue deluxe');
  await card.getByLabel('Nightly rate (INR)', { exact: true }).fill('1200.25');
  await card.getByRole('button', { name: 'Save room type', exact: true }).click();
  await expect(
    card.getByRole('heading', { name: 'Public catalogue deluxe', exact: true }),
  ).toBeVisible();
  await card.getByRole('link', { name: 'Edit public stay content', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Stay public content', exact: true }),
  ).toBeVisible();
  const editorUrl = page.url();
  const photo = {
    name: 'catalogue.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
      'base64',
    ),
  };
  await page
    .getByLabel('Public description', { exact: true })
    .fill('Riverside stay public description');
  await page.getByLabel('Public rules', { exact: true }).fill('Respect quiet hours');
  await page.getByLabel('Amenities (one per line)', { exact: true }).fill('Parking\nWi-Fi');
  await page.getByLabel('Add gallery photos', { exact: true }).setInputFiles(photo);
  await page.getByLabel('Published in stay catalogue', { exact: true }).check();
  await page.getByRole('button', { name: 'Save public content', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Public catalogue acceptance stay gallery photo', exact: true }),
  ).toBeVisible();
  await page.goto('/stays');
  await expect(
    page.getByRole('link', { name: 'Public catalogue acceptance stay', exact: true }),
  ).toHaveCount(0); // Parent publication alone is insufficient.
  await page.goto(editorUrl);
  await page
    .getByLabel('Content target', { exact: true })
    .selectOption({ label: 'Room · Public catalogue deluxe' });
  await page
    .getByLabel('Public description', { exact: true })
    .fill('Private balcony and forest view');
  await page.getByLabel('Add gallery photos', { exact: true }).setInputFiles(photo);
  await page.getByLabel('Published in stay catalogue', { exact: true }).check();
  await page.getByRole('button', { name: 'Save public content', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Public catalogue deluxe gallery photo', exact: true }),
  ).toBeVisible();
  const publicRequests: string[] = [];
  page.on('request', (req) => {
    const path = new URL(req.url()).pathname;
    if (/^\/api\/v1\/stays(?:\/\d+)?$/.test(path)) {
      expect(req.headers().authorization).toBeUndefined();
      expect(req.headers().cookie).toBeUndefined();
      publicRequests.push(path);
    }
  });
  await page.goto('/stays?city=Dandeli');
  await page.getByRole('link', { name: 'Public catalogue acceptance stay', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Public catalogue acceptance stay', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Private balcony and forest view', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Public catalogue acceptance stay photo 1', exact: true }),
  ).toBeVisible();
  expect(
    await page
      .getByRole('img', { name: 'Public catalogue acceptance stay photo 1', exact: true })
      .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
  ).toBe(true);
  const detailUrl = page.url();
  expect(publicRequests.length).toBeGreaterThanOrEqual(2);
  await page.goto(editorUrl);
  await page.getByLabel('Published in stay catalogue', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save public content', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Save public content', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Published in stay catalogue', { exact: true })).not.toBeChecked();
  await page.goto(detailUrl);
  await expect(page.getByText('This stay is not available.', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
