import { test, expect } from '@playwright/test';
import { visit as fixture } from '../visit-fixtures';
const meta = { current_page: 1, last_page: 1, total: 1 };
test('staff can schedule, handle conflicts, reschedule, assign and cancel a visit', async ({
  page,
}) => {
  let visit = { ...fixture },
    attempts = 0;
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'browser-visit-token'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    expect(request.headers().authorization).toBe('Bearer browser-visit-token');
    expect(request.headers().cookie).toBeUndefined();
    if (path === '/api/v1/auth/me') {
      await route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Asha',
            email: 'asha@example.test',
            role: { name: 'Staff', permission_type: 'all', permissions: [] },
          },
        },
      });
      return;
    }
    if (path === '/api/v1/admin/properties') {
      await route.fulfill({
        json: { data: [{ id: 7, title: 'River home', city: 'Dandeli' }], meta },
      });
      return;
    }
    if (path === '/api/v1/admin/leads') {
      await route.fulfill({ json: { data: [{ id: 12, title: 'Buyer enquiry' }], meta } });
      return;
    }
    if (path === '/api/v1/admin/site-visit-agents') {
      await route.fulfill({
        json: {
          data: [
            { id: 2, name: 'Ravi' },
            { id: 3, name: 'Meera' },
          ],
          meta: { ...meta, total: 2 },
        },
      });
      return;
    }
    if (path === '/api/v1/admin/site-visits' && request.method() === 'POST') {
      attempts++;
      const data = request.postDataJSON();
      expect(data).toMatchObject({ property_id: 7, lead_id: 12, user_id: 2 });
      expect(data.starts_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
      if (attempts === 1) {
        await route.fulfill({
          status: 422,
          json: { errors: { starts_at: ['Property or agent has an overlapping visit.'] } },
        });
        return;
      }
      visit = { ...visit, ...data };
      await route.fulfill({ status: 201, json: { data: visit } });
      return;
    }
    if (path === '/api/v1/admin/site-visits') {
      await route.fulfill({ json: { data: [visit], meta } });
      return;
    }
    if (path === '/api/v1/admin/site-visits/31') {
      await route.fulfill({ json: { data: visit } });
      return;
    }
    if (request.method() === 'PATCH') {
      const data = request.postDataJSON();
      visit = {
        ...visit,
        ...data,
        ...(path.endsWith('/schedule')
          ? { reschedule_count: 1, reschedule_reason: data.reason }
          : {}),
        events: [
          ...visit.events,
          {
            id: visit.events.length + 1,
            actor_id: 1,
            action: path.endsWith('/schedule')
              ? 'rescheduled'
              : path.endsWith('/assignment')
                ? 'assigned'
                : data.status,
            changes: data,
            created_at: '2026-11-01T10:00:00Z',
          },
        ],
      };
      await route.fulfill({ json: { data: visit } });
      return;
    }
    await route.fulfill({ status: 403, json: {} });
  });
  await page.goto('/staff/site-visits/new');
  await page.getByRole('combobox', { name: 'Property choice', exact: true }).selectOption('7');
  await page.getByRole('combobox', { name: 'Lead choice', exact: true }).selectOption('12');
  await page.getByRole('combobox', { name: 'Visit agent choice', exact: true }).selectOption('2');
  await page.getByLabel('Visit start', { exact: true }).fill('2030-01-01T10:00');
  await page.getByLabel('Visit end', { exact: true }).fill('2030-01-01T11:00');
  await page.getByRole('textbox', { name: 'Visit notes', exact: true }).fill('Keep this draft');
  await page.getByRole('button', { name: 'Save visit', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('overlapping visit');
  await expect(page.getByRole('textbox', { name: 'Visit notes', exact: true })).toHaveValue(
    'Keep this draft',
  );
  await page.getByRole('button', { name: 'Save visit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visit details', exact: true })).toBeVisible();
  await page.getByLabel('Visit start', { exact: true }).fill('2030-01-02T12:00');
  await page.getByLabel('Visit end', { exact: true }).fill('2030-01-02T13:00');
  await page
    .getByRole('textbox', { name: 'Rescheduling reason', exact: true })
    .fill('Buyer requested');
  await page.getByRole('button', { name: 'Save new schedule', exact: true }).click();
  await expect(page.getByText('Visit rescheduled.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Visit agent choice', exact: true }).selectOption('3');
  await page.getByRole('button', { name: 'Save visit assignment', exact: true }).click();
  await expect(page.getByText('Assigned agent #3', { exact: true })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Cancellation reason', exact: true })
    .fill('Buyer unavailable');
  await page.getByRole('button', { name: 'Save outcome', exact: true }).click();
  await expect(page.getByText('Cancellation: Buyer unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reschedule visit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Visit history', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('navigation', { name: 'Staff navigation' })
    .getByRole('link', { name: 'Site visits', exact: true })
    .click();
  await page.getByRole('combobox', { name: 'Visit status', exact: true }).selectOption('cancelled');
  await page.getByRole('button', { name: 'Filter visits', exact: true }).click();
  await expect(page).toHaveURL(/status=cancelled/);
});
test('staff can complete a started visit and update feedback', async ({ page }) => {
  let visit = { ...fixture };
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'browser-visit-token'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Editor',
            email: 'editor@example.test',
            role: {
              name: 'Editor',
              permission_type: 'custom',
              permissions: ['visits.view', 'visits.edit'],
            },
          },
        },
      });
      return;
    }
    if (request.method() === 'PATCH') {
      const data = request.postDataJSON();
      visit = { ...visit, ...data };
      await route.fulfill({ json: { data: visit } });
      return;
    }
    await route.fulfill({ json: { data: visit } });
  });
  await page.goto('/staff/site-visits/31');
  await page
    .getByRole('combobox', { name: 'Visit outcome', exact: true })
    .selectOption('completed');
  await page
    .getByRole('textbox', { name: 'Visit feedback', exact: true })
    .fill('Buyer viewed the property');
  await page.getByRole('button', { name: 'Save outcome', exact: true }).click();
  await expect(
    page.getByText('Feedback: Buyer viewed the property', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Visit feedback', exact: true })
    .fill('Buyer requested a second viewing');
  await page.getByRole('button', { name: 'Save feedback', exact: true }).click();
  await expect(
    page.getByText('Feedback: Buyer requested a second viewing', { exact: true }),
  ).toBeVisible();
});
