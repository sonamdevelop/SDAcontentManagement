import { test, expect } from '@playwright/test';
import { customer } from '../customer-fixtures';
import { property } from '../fixtures';
import {
  savedProperty,
  favouriteMeta,
  popularityRow,
  popularityStaff,
} from '../favourite-fixtures';
test('customer retries saving then removes a redacted unavailable property without using a staff token', async ({
  page,
}) => {
  let puts = 0,
    saved = false;
  await page.addInitScript(() => {
    sessionStorage.setItem('sda.staff.token', 'staff-private');
    sessionStorage.setItem('sda.customer.token', 'customer-private');
  });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith('/properties/7')) {
      expect(req.headers().authorization).toBeUndefined();
      return route.fulfill({ json: { data: property() } });
    }
    expect(req.headers().authorization).toBe('Bearer customer-private');
    if (path.endsWith('/customer/me')) return route.fulfill({ json: { data: customer } });
    if (path.endsWith('/favourites/7')) {
      if (req.method() === 'PUT') {
        puts++;
        saved = true;
        if (puts === 1) return route.abort('failed');
        return route.fulfill({ json: { data: { property_id: 7, saved: true } } });
      }
      if (req.method() === 'DELETE') {
        saved = false;
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ json: { data: { property_id: 7, saved } } });
    }
    if (path.endsWith('/customer/favourites'))
      return route.fulfill({
        json: {
          data: saved ? [{ ...savedProperty, property: null }] : [],
          meta: { ...favouriteMeta, total: saved ? 1 : 0 },
        },
      });
    throw new Error('Unexpected ' + path);
  });
  await page.goto('/properties/7');
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  await page.getByRole('button', { name: 'Retry saving property', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove saved property', exact: true }),
  ).toBeVisible();
  expect(puts).toBe(2);
  await page.getByRole('link', { name: 'My saved properties', exact: true }).click();
  await expect(
    page.getByText('This saved property is currently unavailable.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Remove saved property', exact: true }).click();
  await expect(page.getByText('You have no saved properties yet.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('staff popularity filters survive reload and refresh removes rows below the minimum count', async ({
  page,
}) => {
  let count = 0;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'staff-private'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      u = new URL(req.url());
    expect(req.headers().authorization).toBe('Bearer staff-private');
    if (u.pathname.endsWith('/auth/me')) return route.fulfill({ json: { data: popularityStaff } });
    if (u.pathname.endsWith('/property-favourites')) {
      expect(u.searchParams.get('property_id')).toBe('7');
      expect(u.searchParams.get('min_count')).toBe('2');
      count++;
      return route.fulfill({
        json: {
          data: count <= 2 ? [popularityRow] : [],
          meta: { ...favouriteMeta, total: count <= 2 ? 1 : 0 },
        },
      });
    }
    throw new Error('Unexpected ' + u.pathname);
  });
  await page.goto('/staff/property-favourites?property_id=7&min_count=2');
  await expect(page.getByText('Saved by 2 customers', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Popularity property ID', { exact: true })).toHaveValue('7');
  await page.getByRole('button', { name: 'Refresh property popularity', exact: true }).click();
  await expect(
    page.getByText('No properties match these popularity filters.', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
