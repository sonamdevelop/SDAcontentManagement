import { test, expect } from '@playwright/test';
import { lead, task, pipelines, meta } from '../lead-fixtures';
test('lead assignment, stage, notes and dated follow-ups work on desktop and mobile', async ({
  page,
}) => {
  let current = { ...lead };
  let activities = [{ ...task }];
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'browser-lead-token'));
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    expect(request.headers().authorization).toBe('Bearer browser-lead-token');
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
    if (path === '/api/v1/admin/lead-assignees') {
      await route.fulfill({ json: { data: [{ id: 2, name: 'Ravi' }], meta } });
      return;
    }
    if (path === '/api/v1/admin/lead-pipelines') {
      await route.fulfill({ json: { data: pipelines } });
      return;
    }
    if (path.endsWith('/assignment')) {
      expect(request.postDataJSON()).toEqual({ user_id: 2 });
      current = { ...current, agent: { id: 2, name: 'Ravi' }, user_id: 2 };
      await route.fulfill({ json: { data: current } });
      return;
    }
    if (path.endsWith('/stage')) {
      const data = request.postDataJSON();
      expect(data).toEqual({ lead_pipeline_stage_id: 3, lost_reason: 'Budget mismatch' });
      current = {
        ...current,
        stage: { id: 3, name: 'Lost', code: 'lost' },
        lost_reason: data.lost_reason,
      };
      await route.fulfill({ json: { data: current } });
      return;
    }
    if (path === '/api/v1/admin/leads/12') {
      await route.fulfill({ json: { data: current } });
      return;
    }
    if (path === '/api/v1/admin/leads/12/follow-ups' && request.method() === 'POST') {
      const data = request.postDataJSON();
      if (data.type === 'task') expect(data.due_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
      const activity = {
        ...task,
        id: activities.length + 30,
        ...data,
        is_done: data.type === 'note',
        is_overdue: false,
        due_at: data.due_at || null,
      };
      activities.push(activity);
      await route.fulfill({ status: 201, json: { data: activity } });
      return;
    }
    if (path === '/api/v1/admin/leads/12/follow-ups/22') {
      const data = request.postDataJSON();
      activities = activities.map((a) => (a.id === 22 ? { ...a, ...data, is_overdue: false } : a));
      await route.fulfill({ json: { data: activities[0] } });
      return;
    }
    if (path.endsWith('/follow-ups')) {
      await route.fulfill({
        json: { data: activities, meta: { ...meta, total: activities.length } },
      });
      return;
    }
    await route.fulfill({ status: 403, json: {} });
  });
  await page.goto('/staff/leads/12');
  await expect(page.getByText('buyer@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText(/₹65,00,000.51/)).toBeVisible();
  await page.getByRole('combobox', { name: 'New agent', exact: true }).selectOption('2');
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await expect(page.getByText('Agent assignment saved.', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'New stage', exact: true }).selectOption('3');
  await page.getByLabel('Lost reason', { exact: true }).fill('Budget mismatch');
  await page.getByRole('button', { name: 'Save stage', exact: true }).click();
  await expect(page.getByText('Lost reason: Budget mismatch', { exact: true })).toBeVisible();
  await page.getByLabel('Note text', { exact: true }).fill('<b>Plain text note</b>');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(page.getByText('<b>Plain text note</b>', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'New activity type', exact: true }).selectOption('task');
  await page.getByLabel('Task title', { exact: true }).fill('Visit follow-up');
  await page.getByLabel('Due date and time', { exact: true }).fill('2026-12-14T10:30');
  await page.getByRole('button', { name: 'Add follow-up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visit follow-up', exact: true })).toBeVisible();
  const original = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Call buyer', exact: true }) });
  await original.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(original.getByRole('button', { name: 'Mark pending', exact: true })).toBeVisible();
  await original.getByRole('button', { name: 'Edit task', exact: true }).click();
  await page.getByLabel('Task title', { exact: true }).fill('Call buyer again');
  await page.getByLabel('Due date and time', { exact: true }).fill('2026-12-15T11:45');
  await page.getByRole('button', { name: 'Save activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Call buyer again', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'River home enquiry', exact: true }),
  ).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Follow-ups', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Follow-up queue', exact: true })).toBeVisible();
  await page.getByLabel('Overdue tasks only', { exact: true }).check();
  await page.getByRole('button', { name: 'Filter activities', exact: true }).click();
  await expect(page).toHaveURL(/overdue=1/);
});
