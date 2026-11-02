import { test, expect } from '@playwright/test';
test('real stay setup, room inventory, exact booking totals, rejection and cancellation', async ({
  page,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Stays and rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Add stay', exact: true }).click();
  await page.getByLabel('Stay name', { exact: true }).fill('Acceptance forest stay');
  await page.getByLabel('Stay city', { exact: true }).fill('Dandeli');
  await page.getByRole('button', { name: 'Save stay', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Acceptance forest stay', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add room type', exact: true }).click();
  await page.getByLabel('Room type name', { exact: true }).fill('Acceptance deluxe');
  await page.getByLabel('Room inventory', { exact: true }).fill('2');
  await page.getByLabel('Guests per room', { exact: true }).fill('2');
  await page.getByLabel('Nightly rate (INR)', { exact: true }).fill('1000.25');
  await page.getByRole('button', { name: 'Save room type', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Acceptance deluxe', exact: true })).toBeVisible();
  const inDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    outDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  async function quote() {
    await page.goto('/staff/stay-bookings/new');
    await page
      .getByRole('combobox', { name: 'Booking room type', exact: true })
      .selectOption({ label: 'Acceptance forest stay · Acceptance deluxe · Asia/Kolkata' });
    await page.getByLabel('Check-in date', { exact: true }).fill(inDate);
    await page.getByLabel('Check-out date', { exact: true }).fill(outDate);
    await page.getByRole('button', { name: 'Check availability', exact: true }).click();
  }
  await quote();
  await expect(page.getByText(/2 rooms available/)).toBeVisible();
  await page.getByLabel('Number of rooms', { exact: true }).fill('2');
  await page.getByLabel('Number of guests', { exact: true }).fill('4');
  await page.getByLabel('Guest name', { exact: true }).fill('Synthetic stay guest');
  await page.getByLabel('Recorded booking advance', { exact: true }).fill('100.01');
  await expect(page.getByText('Quoted total: ₹4,001', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save stay booking', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Stay booking #/ })).toBeVisible();
  const bookedUrl = page.url();
  await expect(page.getByText(/Balance: ₹3,900.99/)).toBeVisible();
  await quote();
  await expect(page.getByText(/0 rooms available/)).toBeVisible();
  await page.goto(bookedUrl);
  await page.getByRole('button', { name: 'Cancel stay booking', exact: true }).click();
  await page
    .getByLabel('Booking cancellation reason', { exact: true })
    .fill('Synthetic cancellation');
  await page.getByRole('button', { name: 'Yes, cancel stay booking', exact: true }).click();
  await expect(
    page.getByText('Booking cancellation: Synthetic cancellation', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Booking history', exact: true })).toBeVisible();
  await quote();
  await expect(page.getByText(/2 rooms available/)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff sign in', exact: true })).toBeVisible();
});
