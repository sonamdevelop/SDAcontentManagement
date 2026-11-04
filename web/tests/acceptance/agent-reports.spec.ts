import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('real report filters timezone and exports current scoped agent metrics without private source details', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const token = await page.evaluate(() => sessionStorage.getItem('sda.staff.token')),
    headers = { Authorization: `Bearer ${token}` },
    me = await (await page.request.get('/api/v1/auth/me', { headers })).json();
  const created = await page.request.post('/api/v1/admin/properties', {
    headers,
    data: {
      title: 'Private report source home',
      purpose: 'sale',
      property_type: 'house',
      price: '4000000.00',
      area: '1200',
      area_unit: 'sqft',
      address: 'Private report address',
      city: 'Report test city',
      state: 'Karnataka',
      owner_name: 'Private report owner',
      status: 'available',
      is_published: true,
      accepts_enquiries: true,
    },
  });
  expect(created.status()).toBe(201);
  const p = (await created.json()).data;
  expect(
    (
      await page.request.patch(`/api/v1/admin/properties/${p.id}/moderation`, {
        headers,
        data: { expected_revision: 1, decision: 'approved', reason: 'Reviewed report source' },
      })
    ).status(),
  ).toBe(200);
  const email = `report-${Date.now()}@example.test`;
  expect(
    (
      await page.request.post(`/api/v1/properties/${p.id}/enquiries`, {
        data: {
          submission_id: randomUUID(),
          name: 'Private report customer',
          email,
          phone: '+91 9000000000',
          message: 'Synthetic report enquiry',
          consent: true,
        },
      })
    ).status(),
  ).toBe(202);
  const enquiries = (
    await (
      await page.request.get(`/api/v1/admin/enquiries?property_id=${p.id}`, { headers })
    ).json()
  ).data;
  const starts = new Date(Date.now() + 3600000),
    ends = new Date(Date.now() + 7200000);
  expect(
    (
      await page.request.post('/api/v1/admin/site-visits', {
        headers,
        data: {
          property_id: p.id,
          lead_id: enquiries[0].lead_id,
          user_id: me.data.id,
          starts_at: starts.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          ends_at: ends.toISOString().replace(/\.\d{3}Z$/, 'Z'),
          notes: 'Private report visit',
        },
      })
    ).status(),
  ).toBe(201);
  const from = new Date().toISOString().slice(0, 10),
    to = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.goto(`/staff/agent-reports?from=${from}&to=${to}&timezone=UTC&user_id=${me.data.id}`);
  await expect(
    page.getByRole('heading', { name: new RegExp(`Agent #${me.data.id}$`) }),
  ).toBeVisible();
  await expect(page.getByRole('img', { name: /Lead outcomes/ })).toBeVisible();
  await expect(page.getByText('Upcoming scheduled visits: 1', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Report timezone', { exact: true })).toHaveValue('UTC');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export filtered agents CSV', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^sda-agent-report-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  for (const value of ['agent_id,agent_name', 'leads_total', 'visits_total', me.data.name, 'UTC'])
    expect(csv).toContain(value);
  expect(csv).not.toContain(email);
  expect(csv).not.toContain('Private report customer');
  expect(csv).not.toContain('Private report address');
  expect(errors).toEqual([]);
});
