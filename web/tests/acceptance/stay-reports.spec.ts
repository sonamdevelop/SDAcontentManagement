import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('real stay report separates reserved value from recorded cash and refreshes after cancellation', async ({
  page,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const token = await page.evaluate(() => sessionStorage.getItem('sda.staff.token'));
  const headers = { Authorization: `Bearer ${token}` };
  const created = await page.request.post('/api/v1/admin/stays', {
    headers,
    data: { name: 'Report acceptance stay', city: 'Dandeli', timezone: 'UTC', active: true },
  });
  expect(created.status()).toBe(201);
  const stay = (await created.json()).data;
  const roomResponse = await page.request.post(`/api/v1/admin/stays/${stay.id}/rooms`, {
    headers,
    data: { name: 'Report room', inventory: 3, capacity: 2, nightly_rate: '100.01', active: true },
  });
  expect(roomResponse.status()).toBe(201);
  const room = (await roomResponse.json()).data;
  const from = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    to = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const response = await page.request.post('/api/v1/admin/stay-bookings', {
    headers,
    data: {
      request_id: randomUUID(),
      room_type_id: room.id,
      check_in: from,
      check_out: to,
      rooms: 2,
      guests: 2,
      guest_name: 'Private report guest',
      guest_email: 'private-stay-report@example.test',
      expected_rate: '100.01',
      advance: '50.01',
    },
  });
  expect(response.status()).toBe(201);
  const booking = (await response.json()).data;
  const url = `/staff/stay-reports?stay_id=${stay.id}&from=${from}&to=${to}`;
  await page.goto(url);
  await expect(page.getByText('INR 400.04', { exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export stay report CSV' }).click();
  const file = await pending;
  expect(file.suggestedFilename()).toBe(`sda-stay-report-${stay.id}-${from}-${to}.csv`);
  const stream = await file.createReadStream(),
    chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain('400.04');
  for (const secret of ['Private report guest', 'private-stay-report@example.test', 'payload_hash'])
    expect(csv).not.toContain(secret);
  await expect(page.getByText(/Booked room-nights: 4/)).toBeVisible();
  await expect(page.getByText('No visible ledger movements in this range.')).toBeVisible();
  await expect(page.getByText('Private report guest', { exact: true })).toHaveCount(0);
  const today = new Date().toISOString().slice(0, 10),
    tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.goto(`/staff/stay-reports?stay_id=${stay.id}&from=${today}&to=${tomorrow}`);
  await expect(page.getByText(/Net movement: 50.01/)).toBeVisible();
  expect(
    (
      await page.request.patch(`/api/v1/admin/stay-bookings/${booking.id}/cancel`, {
        headers,
        data: { cancellation_reason: 'Report cancellation check' },
      })
    ).status(),
  ).toBe(200);
  await page.goto(url);
  await expect(page.getByText(/Booked room-nights: 0/)).toBeVisible();
  await expect(page.getByText('No visible confirmed booked value.')).toBeVisible();
});
