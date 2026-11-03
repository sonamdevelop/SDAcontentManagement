import { test, expect } from '@playwright/test';
test('real offline payment, refund, reversal, cancellation and final refund preserve audit records', async ({
  page,
}) => {
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.goto('/staff/stays');
  await page.getByRole('button', { name: 'Add stay', exact: true }).click();
  await page.getByLabel('Stay name', { exact: true }).fill('Ledger acceptance stay');
  await page.getByLabel('Stay city', { exact: true }).fill('Dandeli');
  await page.getByRole('button', { name: 'Save stay', exact: true }).click();
  const card = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Ledger acceptance stay', exact: true }) });
  await card.getByRole('button', { name: 'Add room type', exact: true }).click();
  await card.getByLabel('Room type name', { exact: true }).fill('Ledger deluxe');
  await card.getByLabel('Nightly rate (INR)', { exact: true }).fill('1000.25');
  await card.getByRole('button', { name: 'Save room type', exact: true }).click();
  await expect(card.getByRole('heading', { name: 'Ledger deluxe', exact: true })).toBeVisible();
  await page.goto('/staff/stay-bookings/new');
  await page
    .getByRole('combobox', { name: 'Booking room type', exact: true })
    .selectOption({ label: 'Ledger acceptance stay · Ledger deluxe · Asia/Kolkata' });
  await page
    .getByLabel('Check-in date', { exact: true })
    .fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  await page
    .getByLabel('Check-out date', { exact: true })
    .fill(new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Check availability', exact: true }).click();
  await expect(page.getByText(/1 rooms available/)).toBeVisible();
  await page.getByLabel('Guest name', { exact: true }).fill('Synthetic ledger guest');
  await page.getByLabel('Recorded booking advance', { exact: true }).fill('100.01');
  await page.getByRole('button', { name: 'Save stay booking', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Stay booking #/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Opening advance #/ })).toBeVisible();
  const bookingUrl = page.url();
  await page.goto('/staff/stay-payment-follow-ups');
  await page
    .getByRole('combobox', { name: 'Payment follow-up stay', exact: true })
    .selectOption({ label: 'Ledger acceptance stay · Dandeli' });
  await page.getByRole('button', { name: 'Show payment follow-up', exact: true }).click();
  await expect(page.getByText('Pending collection: ₹1,900.49', { exact: true })).toBeVisible();
  const collectionUrl = page.url();
  await page.getByRole('link', { name: /Synthetic ledger guest — Ledger deluxe #/ }).click();
  async function record(kind: 'payment' | 'refund', amount: string, reason: string) {
    await page
      .getByRole('button', {
        name: kind === 'payment' ? 'Record payment' : 'Record refund',
        exact: true,
      })
      .click();
    await page.getByLabel('Ledger amount', { exact: true }).fill(amount);
    await page
      .getByLabel(kind === 'payment' ? 'Ledger reason' : 'Ledger reason *', { exact: true })
      .fill(reason);
    await page.getByRole('button', { name: 'Review entry', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm financial entry', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Close financial form', exact: true }),
    ).toHaveCount(0);
  }
  await record('payment', '500.49', 'Synthetic cash receipt');
  await expect(page.getByText(/Net paid: ₹600.50 · Outstanding: ₹1,400/)).toBeVisible();
  await record('refund', '25.25', 'Synthetic partial refund');
  await expect(page.getByText(/Net paid: ₹575.25 · Outstanding: ₹1,425.25/)).toBeVisible();
  const refund = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: /^Refund #/ }) });
  await refund.getByRole('button', { name: /Correct entry #/ }).click();
  await page.getByLabel('Ledger reason *', { exact: true }).fill('Wrong refund record');
  await page.getByRole('button', { name: 'Review entry', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm financial entry', exact: true }).click();
  await expect(page.getByText(/Reversed by entry #/)).toBeVisible();
  await expect(page.getByText(/Net paid: ₹600.50 · Outstanding: ₹1,400/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel stay booking', exact: true }).click();
  await page
    .getByLabel('Booking cancellation reason', { exact: true })
    .fill('Synthetic cancellation');
  await page.getByRole('button', { name: 'Yes, cancel stay booking', exact: true }).click();
  await expect(
    page.getByText('Booking cancellation: Synthetic cancellation', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Net paid: ₹600.50 · Outstanding: ₹0 · Refund due: ₹600.50/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0);
  await page.goto(collectionUrl);
  await expect(
    page.getByRole('button', { name: 'Pending collection (0)', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Pending refund (1)', exact: true }).click();
  await expect(page.getByText('Pending refund: ₹600.50', { exact: true })).toBeVisible();
  const refundUrl = page.url();
  await page.goto(bookingUrl);
  await record('refund', '600.50', 'Refund after cancellation');
  await expect(page.getByText(/Net paid: ₹0 · Outstanding: ₹0 · Refund due: ₹0/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Net paid: ₹0 · Outstanding: ₹0 · Refund due: ₹0/)).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Payment #/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Opening advance #/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Reversal #/ })).toBeVisible();
  await page.getByRole('link', { name: 'Open printable statement', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Stay booking statement #/ })).toBeVisible();
  await expect(page.getByText(/All 5 ledger entries, in recorded order/)).toBeVisible();
  const summary = page.getByRole('heading', { name: 'Account summary', exact: true }).locator('..');
  await expect(
    summary
      .locator('dt', { hasText: /^Net paid$/ })
      .locator('..')
      .locator('dd'),
  ).toHaveText('₹0');
  await expect(page.getByText('Wrong refund record', { exact: true })).toHaveCount(0);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeHidden();
  await expect(page.getByRole('article', { name: 'Booking statement', exact: true })).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.goto(refundUrl);
  await expect(page.getByRole('button', { name: 'Pending refund (0)', exact: true })).toBeVisible();
  await expect(page.getByText('No bookings in this payment queue.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff sign in', exact: true })).toBeVisible();
});
