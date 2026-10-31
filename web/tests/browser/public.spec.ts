import { test, expect } from '@playwright/test';
import { property, page as propertyPage } from '../fixtures';
const listings = [
  property({ photos: ['/brand/stay-interior.webp', '/brand/stay-interior.webp?second'] }),
  property({
    id: 8,
    title: 'Garden villa',
    purpose: 'rent',
    property_type: 'villa',
    price: '25000.00',
    rent_period: 'monthly',
  }),
  property({
    id: 9,
    title: 'A plot for your plans',
    property_type: 'plot',
    bedrooms: null,
    bathrooms: null,
    price: '4500000.00',
  }),
];
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers().cookie).toBeUndefined();
    if (request.method() === 'POST') {
      await route.fulfill({ status: 202, json: { message: 'Enquiry received' } });
      return;
    }
    if (url.pathname === '/api/v1/properties') {
      const filtered = listings.filter(
        (p) =>
          (!url.searchParams.get('purpose') || p.purpose === url.searchParams.get('purpose')) &&
          (!url.searchParams.get('city') || p.city === url.searchParams.get('city')),
      );
      await route.fulfill({ json: propertyPage(filtered) });
      return;
    }
    const id = Number(url.pathname.split('/').at(-1));
    const record = listings.find((p) => p.id === id);
    await route.fulfill(
      record ? { json: { data: record } } : { status: 404, json: { message: 'Not found' } },
    );
  });
});
test('URL filters survive refresh and navigation back from a property', async ({
  page,
}, testInfo) => {
  await page.goto('/properties');
  await expect(page.getByRole('heading', { name: 'River view apartment' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('catalog.png'), fullPage: true });
  await page.getByLabel('City', { exact: true }).fill('Dandeli');
  await page.getByLabel('Looking to').selectOption('sale');
  await page.getByRole('button', { name: 'Find properties' }).click();
  await expect(page).toHaveURL(/city=Dandeli.*purpose=sale/);
  await expect(page.getByRole('heading', { name: 'Garden villa' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('City', { exact: true })).toHaveValue('Dandeli');
  await page.getByRole('link', { name: 'River view apartment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'River view apartment' })).toBeVisible();
  await page.getByRole('button', { name: 'Next photo' }).click();
  await expect(page.getByRole('img', { name: 'River view apartment — photo 2' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to properties' }).click();
  await expect(page).toHaveURL(/city=Dandeli.*purpose=sale/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('submits a consented public enquiry without staff authentication', async ({ page }) => {
  let payload: Record<string, unknown> | undefined;
  await page.route('**/api/v1/properties/8/enquiries', async (route) => {
    payload = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBeUndefined();
    await route.fulfill({ status: 202, json: { message: 'Received' } });
  });
  await page.goto('/properties/8');
  await expect(page.getByText('₹25,000')).toBeVisible();
  await page.getByLabel('Your name *', { exact: true }).fill('Asha Rao');
  await page.getByLabel('Email address *', { exact: true }).fill('ASHA@example.com');
  await page.getByLabel('Your message *', { exact: true }).fill('Please arrange a viewing.');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByText('Please agree to be contacted about this property.')).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Enquiry sent.' })).toBeVisible();
  expect(payload?.email).toBe('asha@example.com');
  expect(payload?.consent).toBe(true);
  expect(payload?.submission_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('displays empty and unavailable states and keeps legacy stays navigation', async ({
  page,
}) => {
  await page.goto('/properties?city=NoMatches');
  await expect(page.getByText('No properties match just yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('heading', { name: 'River view apartment' })).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Open navigation' });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }
  await expect(page.getByRole('link', { name: 'Explore stays' })).toHaveAttribute(
    'href',
    'https://stayindandeli.in/',
  );
  await page.goto('/properties/999');
  await expect(
    page.getByRole('heading', { name: 'This property is no longer available.' }),
  ).toBeVisible();
});
test('retains fields and submission identity across an uncertain network failure', async ({
  page,
}) => {
  const keys: unknown[] = [];
  await page.route('**/api/v1/properties/7/enquiries', async (route) => {
    keys.push(route.request().postDataJSON().submission_id);
    if (keys.length === 1) await route.abort('failed');
    else await route.fulfill({ status: 202, json: { message: 'Received' } });
  });
  await page.goto('/properties/7');
  await page.getByLabel('Your name *', { exact: true }).fill('Asha Rao');
  await page.getByLabel('Email address *', { exact: true }).fill('asha@example.com');
  await page.getByLabel('Your message *', { exact: true }).fill('Please arrange a visit.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('alert')).toContainText('Your details are still here');
  await expect(page.getByLabel('Your name *', { exact: true })).toHaveValue('Asha Rao');
  await page.getByRole('button', { name: 'Send enquiry' }).click();
  await expect(page.getByRole('heading', { name: 'Enquiry sent.' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});
