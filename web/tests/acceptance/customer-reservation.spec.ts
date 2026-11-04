import { test, expect } from '@playwright/test';
import { capturedMailLink } from './mail';
test('real customer reserve and cancellation review share inventory and preserve owned financial and actor history', async ({
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
  await page.getByLabel('Stay name', { exact: true }).fill('Customer reserve acceptance stay');
  await page.getByLabel('Stay city', { exact: true }).fill('Reservation test city');
  await page.getByRole('button', { name: 'Save stay', exact: true }).click();
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Customer reserve acceptance stay', exact: true }),
  });
  await card.getByRole('button', { name: 'Add room type', exact: true }).click();
  await card.getByLabel('Room type name', { exact: true }).fill('Customer reserve deluxe');
  await card.getByLabel('Room inventory', { exact: true }).fill('1');
  await card.getByLabel('Nightly rate (INR)', { exact: true }).fill('1000.25');
  await card.getByRole('button', { name: 'Save room type', exact: true }).click();
  await expect(
    card.getByRole('heading', { name: 'Customer reserve deluxe', exact: true }),
  ).toBeVisible();
  await card.getByRole('link', { name: 'Edit public stay content', exact: true }).click();
  await page.getByLabel('Published in stay catalogue', { exact: true }).check();
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/content') && r.request().method() === 'POST' && r.ok(),
  );
  await page.getByRole('button', { name: 'Save public content', exact: true }).click();
  await saved;
  await expect(
    page.getByRole('button', { name: 'Save public content', exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Content target', { exact: true })
    .selectOption({ label: 'Room · Customer reserve deluxe' });
  await page.getByLabel('Published in stay catalogue', { exact: true }).check();
  const savedRoom = page.waitForResponse(
    (r) => r.url().endsWith('/content') && r.request().method() === 'POST' && r.ok(),
  );
  await page.getByRole('button', { name: 'Save public content', exact: true }).click();
  await savedRoom;
  await expect(
    page.getByRole('button', { name: 'Save public content', exact: true }),
  ).toBeEnabled();
  await page.goto('/stays');
  await page.getByRole('link', { name: 'Customer reserve acceptance stay', exact: true }).click();
  await page.getByRole('link', { name: 'Reserve this room', exact: true }).click();
  const reserveUrl = page.url();
  await page.getByRole('button', { name: 'Create customer account', exact: true }).click();
  const email = `reserve-${Date.now()}@example.test`;
  await page.getByLabel('Customer name', { exact: true }).fill('Synthetic reserve customer');
  await page.getByLabel('Customer email', { exact: true }).fill(email);
  await page.getByLabel('Customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByLabel('Confirm customer password', { exact: true }).fill('CustomerPass123!');
  await page.getByRole('button', { name: 'Register customer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'My customer account', exact: true }),
  ).toBeVisible();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Send verification email', exact: true }).click();
  await page.goto(await capturedMailLink(email, 'verify'));
  await page.getByRole('button', { name: 'Confirm email verification', exact: true }).click();
  await expect(
    page.getByText('Email verified. Return to your account to refresh its status.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(reserveUrl);
  const inDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    outDate = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  async function quote() {
    await page.getByLabel('Reservation check-in', { exact: true }).fill(inDate);
    await page.getByLabel('Reservation check-out', { exact: true }).fill(outDate);
    await page.getByRole('button', { name: 'Check room availability', exact: true }).click();
  }
  await quote();
  await expect(page.getByText(/1 rooms available/)).toBeVisible();
  await page.getByLabel('Reservation guests', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Review reservation', exact: true }).click();
  await expect(page.getByText('Reservation total: ₹2,000.50', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Confirm reservation', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^My booking #/ })).toBeVisible();
  const bookingId = new URL(page.url()).pathname.split('/').at(-1)!;
  await expect(page.getByText(/Outstanding: ₹2,000.50/)).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: `My booking #${bookingId}`, exact: true }),
  ).toBeVisible();
  await page.goto(reserveUrl);
  await quote();
  await expect(
    page.getByText('No rooms are available for these dates. Choose another range or room.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`/staff/stay-bookings/${bookingId}`);
  await expect(page.getByRole('heading', { name: /^Stay booking #/ })).toBeVisible();
  await expect(page.getByText('Customer created', { exact: true })).toBeVisible();
  await expect(page.getByText(/Customer #/)).toBeVisible();
  await expect(page.getByText(/Recorded advance: ₹0/)).toBeVisible();
  await page.goto(`/account/bookings/${bookingId}`);
  async function requestCancellation(reason: string) {
    await page.getByLabel('Cancellation request reason', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Review cancellation request', exact: true }).click();
    await page.getByRole('button', { name: 'Send cancellation request', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Request #\d+: Pending/ })).toBeVisible();
  }
  async function decide(decision: 'approve' | 'reject', reason: string) {
    await page.goto(`/staff/stay-cancellation-requests?booking_id=${bookingId}&status=pending`);
    await page.getByLabel('Cancellation decision', { exact: true }).selectOption(decision);
    await page.getByLabel('Customer-visible decision reason', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Review cancellation decision', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm cancellation decision', exact: true }).click();
    await expect(
      page.getByText('No cancellation requests match these filters.', { exact: true }),
    ).toBeVisible();
  }
  await requestCancellation('Change of travel plans');
  await decide('reject', 'Please confirm with your group');
  await page.goto(`/account/bookings/${bookingId}`);
  await expect(
    page.getByText('Staff response: Please confirm with your group', { exact: true }),
  ).toBeVisible();
  await requestCancellation('Group cannot travel');
  await decide('approve', 'Approved as requested');
  await page.goto(`/account/bookings/${bookingId}`);
  await expect(page.getByText(/Booking: Cancelled/)).toBeVisible();
  await expect(page.getByText(/Outstanding: ₹0/)).toBeVisible();
  await expect(
    page.getByText('Staff response: Approved as requested', { exact: true }),
  ).toBeVisible();
  await page.goto(reserveUrl);
  await quote();
  await expect(page.getByText(/1 rooms available/)).toBeVisible();
  expect(errors).toEqual([]);
});
