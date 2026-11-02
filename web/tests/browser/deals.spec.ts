import { test, expect } from '@playwright/test';
import { deal as fixture } from '../deal-fixtures';
const meta = { current_page: 1, last_page: 1, total: 1 };
test('reserve with exact advance, retry uncertain write, inspect history and cancel on desktop/mobile', async ({
  page,
}) => {
  let deal = { ...fixture },
    attempts = 0;
  const payloads: unknown[] = [];
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'browser-deal-token'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    expect(req.headers().authorization).toBe('Bearer browser-deal-token');
    expect(req.headers().cookie).toBeUndefined();
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: { name: 'Staff', permission_type: 'all', permissions: [] },
          },
        },
      });
    if (path === '/api/v1/admin/properties') {
      expect(url.searchParams.get('status')).toBe('available');
      return route.fulfill({
        json: { data: [{ id: 7, title: 'River home', city: 'Dandeli' }], meta },
      });
    }
    if (path === '/api/v1/admin/leads')
      return route.fulfill({ json: { data: [{ id: 12, title: 'Buyer enquiry' }], meta } });
    if (path === '/api/v1/admin/property-deals' && req.method() === 'POST') {
      attempts++;
      payloads.push(req.postDataJSON());
      expect(req.postDataJSON()).toMatchObject({
        property_id: 7,
        lead_id: 12,
        agreed_price: '9999999999999.99',
        booking_amount: '50000.25',
        payment_reference: 'Receipt A',
      });
      if (attempts === 1) return route.abort('failed');
      expect(payloads[1]).toEqual(payloads[0]);
      return route.fulfill({ json: { data: deal } });
    }
    if (path.endsWith('/41/cancel')) {
      expect(req.method()).toBe('PATCH');
      expect(req.postDataJSON()).toEqual({ cancellation_reason: 'Customer withdrew' });
      deal = {
        ...deal,
        status: 'cancelled',
        cancelled_at: '2026-11-02T10:00:00Z',
        cancellation_reason: 'Customer withdrew',
        events: [
          ...deal.events,
          {
            id: 2,
            actor_id: 1,
            action: 'cancelled',
            changes: { property_status: 'available' },
            created_at: '2026-11-02T10:00:00Z',
          },
        ],
      };
      return route.fulfill({ json: { data: deal } });
    }
    if (path.endsWith('/property-deals/41')) return route.fulfill({ json: { data: deal } });
    if (path.endsWith('/property-deals')) return route.fulfill({ json: { data: [deal], meta } });
    throw new Error(`Unexpected ${req.method()} ${path}`);
  });
  await page.goto('/staff/property-deals/new');
  await page.getByLabel('Property choice').selectOption('7');
  await page.getByLabel('Lead choice').selectOption('12');
  await page.getByLabel('Agreed total', { exact: true }).fill('9999999999999.99');
  await page.getByLabel('Recorded advance', { exact: true }).fill('50000.25');
  await page.getByLabel('Payment reference').fill('Receipt A');
  await page.getByRole('button', { name: 'Save reservation' }).click();
  await expect(page.getByLabel('Agreed total', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry same reservation' }).click();
  await expect(page.getByRole('heading', { name: 'Deal #41' })).toBeVisible();
  await expect(page.getByText('Recorded advance: ₹50,000.25')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Deal history' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
  await page.getByLabel('Cancellation reason').fill('Customer withdrew');
  await page.getByRole('button', { name: 'Yes, cancel reservation' }).click();
  await expect(page.getByText('Cancellation: Customer withdrew')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm deal', exact: true })).toHaveCount(0);
  await expect(page.getByText('available', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '← Property deals' }).click();
  await page.getByLabel('Deal status').selectOption('cancelled');
  await page.getByRole('button', { name: 'Filter deals' }).click();
  await expect(page).toHaveURL(/status=cancelled/);
  await page.reload();
  await expect(page.getByLabel('Deal status')).toHaveValue('cancelled');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('confirms rental only after review and shows terminal history with deleted source references', async ({
  page,
}) => {
  let confirmed = false;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'rental-token'));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: { name: 'Staff', permission_type: 'all', permissions: [] },
          },
        },
      });
    if (path.endsWith('/confirm')) {
      expect(route.request().postDataJSON()).toEqual({});
      confirmed = true;
    }
    return route.fulfill({
      json: {
        data: {
          ...fixture,
          purpose: 'rent',
          rent_period: 'monthly',
          property_id: null,
          lead_id: null,
          status: confirmed ? 'confirmed' : 'reserved',
          confirmed_at: confirmed ? '2026-11-02T10:00:00Z' : null,
        },
      },
    });
  });
  await page.goto('/staff/property-deals/41');
  await page.getByRole('button', { name: 'Confirm deal', exact: true }).click();
  await expect(page.getByText(/property will become rented/)).toBeVisible();
  expect(confirmed).toBe(false);
  await page.getByRole('button', { name: 'Yes, confirm deal' }).click();
  await expect(page.getByText('Deal outcome saved.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel reservation', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('buyer@example.test', { exact: false })).toBeVisible();
});
test('read-only deal viewer has no reservation or outcome actions', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'viewer-token'));
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({
      json: {
        data: new URL(route.request().url()).pathname.endsWith('/auth/me')
          ? {
              id: 1,
              name: 'Reader',
              email: 'reader@example.test',
              role: { name: 'Reader', permission_type: 'custom', permissions: ['deals.view'] },
            }
          : fixture,
      },
    }),
  );
  await page.goto('/staff/property-deals/41');
  await expect(page.getByRole('heading', { name: 'Deal #41' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm deal', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cancel reservation', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('link', { name: 'Reserve property', exact: true })).toHaveCount(0);
});
