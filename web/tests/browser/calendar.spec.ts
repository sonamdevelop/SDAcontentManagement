import { test, expect } from '@playwright/test';
import { calendar } from '../calendar-fixtures';
import { stay, stayMeta as meta } from '../stay-fixtures';
test('shows nightly counts, retains URL range on reload and refreshes after inventory release', async ({
  page,
}) => {
  let released = false;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'calendar-browser'));
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    expect(req.headers().authorization).toBe('Bearer calendar-browser');
    expect(req.headers().cookie).toBeUndefined();
    if (path.endsWith('/auth/me'))
      return route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Staff',
            email: 'staff@example.test',
            role: { name: 'Staff', permission_type: 'custom', permissions: ['stays'] },
          },
        },
      });
    if (path.endsWith('/admin/stays')) return route.fulfill({ json: { data: [stay], meta } });
    if (path.endsWith('/calendar')) {
      expect(url.searchParams.get('from')).toBe(calendar.from);
      expect(url.searchParams.get('to')).toBe(calendar.to);
      return route.fulfill({
        json: {
          data: released
            ? {
                ...calendar,
                days: calendar.days.map((d) => ({
                  ...d,
                  occupied_rooms: 0,
                  available_rooms: 2,
                  bookable: d.date >= calendar.today,
                })),
              }
            : calendar,
        },
      });
    }
    throw new Error(`Unexpected ${path}`);
  });
  await page.goto('/staff/stay-calendar');
  await page.getByRole('combobox', { name: 'Calendar room type', exact: true }).selectOption('2');
  await page.getByLabel('Calendar from', { exact: true }).fill(calendar.from);
  await page.getByLabel('Calendar to (exclusive)', { exact: true }).fill(calendar.to);
  await page.getByRole('button', { name: 'Show calendar', exact: true }).click();
  await expect(
    page.getByRole('table', { name: 'Nightly room availability', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Full', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/room_type_id=2/);
  await page.reload();
  await expect(page.getByLabel('Calendar from', { exact: true })).toHaveValue(calendar.from);
  released = true;
  await page.getByRole('button', { name: 'Refresh calendar', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Full', exact: true })).toHaveCount(0);
  await expect(page.getByRole('cell', { name: 'Available', exact: true })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
