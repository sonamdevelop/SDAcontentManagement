import { test, expect } from '@playwright/test';
// Real HTTP only: this suite must run through the isolated-database shell runner.
test('real staff/public journey: publish, enquire, follow up, visit, cancel and confirm a deal', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/staff/login');
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('admin123');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Add property', exact: true }).click();
  for (const [label, value] of [
    ['Title *', 'Acceptance river home'],
    ['Price (INR) *', '6500000.50'],
    ['Area *', '1200'],
    ['Address *', 'Private acceptance address'],
    ['City *', 'Dandeli'],
    ['State *', 'Karnataka'],
    ['Owner name *', 'Private acceptance owner'],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Published on website').check();
  await page.getByLabel('Accept enquiries').check();
  await page.getByLabel('Add photos', { exact: true }).setInputFiles({
    name: 'acceptance.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const creation = page.waitForResponse(
    (r) => r.url().endsWith('/admin/properties') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save property', exact: true }).click();
  const response = await creation;
  expect(response.status()).toBe(201);
  const property = (await response.json()).data;
  await expect(
    page.getByRole('heading', { name: 'Acceptance river home', exact: true }),
  ).toBeVisible();
  await page.goto(`/staff/properties/${property.id}/documents`);
  await page.getByLabel('Document title', { exact: true }).fill('Acceptance registry');
  const documentBytes = Buffer.from('%PDF-1.4\n%%EOF\n');
  await page
    .getByLabel('Document file', { exact: true })
    .setInputFiles({ name: 'acceptance.pdf', mimeType: 'application/pdf', buffer: documentBytes });
  const upload = page.waitForResponse(
    (r) => r.url().endsWith('/documents') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Upload document', exact: true }).click();
  const documentResponse = await upload;
  expect(documentResponse.status()).toBe(201);
  const document = (await documentResponse.json()).data;
  expect(
    (
      await page.request.get(
        `/api/v1/admin/properties/${property.id}/documents/${document.id}/download`,
      )
    ).status(),
  ).toBe(401);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download document', exact: true }).click();
  const download = await downloaded;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(documentBytes);
  await page.goto(`/properties/${property.id}`);
  await expect(
    page.getByRole('heading', { name: 'Acceptance river home', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Private acceptance address', { exact: true })).toHaveCount(0);
  const photo = page.locator('.photo-gallery img').first();
  await expect(photo).toBeVisible();
  // The public photo URL must serve actual bytes, independent of gallery layout.
  expect(property.photos.length).toBeGreaterThan(0);
  expect((await page.request.get(property.photos[0])).ok()).toBe(true);
  await page.getByLabel('Your name *', { exact: true }).fill('Acceptance Buyer');
  await page.getByLabel('Email address *', { exact: true }).fill('acceptance-buyer@example.test');
  await page
    .getByLabel('Your message *', { exact: true })
    .fill('Please arrange an acceptance visit.');
  await page.getByRole('checkbox', { name: /I agree to be contacted/ }).check();
  const enquiryRequest = page.waitForRequest(
    (r) => r.url().endsWith('/enquiries') && r.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Send enquiry', exact: true }).click();
  expect((await enquiryRequest).headers().authorization).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Enquiry sent.', exact: true })).toBeVisible();
  await page.goto('/staff/enquiries');
  await page.getByRole('link', { name: /Open lead #/ }).click();
  const leadId = page.url().split('/').at(-1)!;
  await page.getByLabel('Note text', { exact: true }).fill('Acceptance customer requested a visit');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(
    page.getByText('Acceptance customer requested a visit', { exact: true }),
  ).toBeVisible();
  await page.getByRole('combobox', { name: 'New activity type', exact: true }).selectOption('task');
  await page.getByLabel('Task title', { exact: true }).fill('Acceptance follow-up');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await page.getByLabel('Due date and time', { exact: true }).fill(tomorrow);
  await page.getByRole('button', { name: 'Add follow-up', exact: true }).click();
  const task = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Acceptance follow-up', exact: true }) });
  await task.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(task.getByRole('button', { name: 'Mark pending', exact: true })).toBeVisible();
  await page.goto('/staff/site-visits/new');
  await page
    .getByRole('combobox', { name: 'Property choice', exact: true })
    .selectOption(String(property.id));
  await page.getByRole('combobox', { name: 'Lead choice', exact: true }).selectOption(leadId);
  const agent = page.getByRole('combobox', { name: 'Visit agent choice', exact: true });
  await expect(agent.locator('option')).toHaveCount(2);
  await agent.selectOption({ index: 1 });
  const start = new Date(Date.now() + 2 * 86400000),
    end = new Date(start.getTime() + 3600000);
  await page.getByLabel('Visit start', { exact: true }).fill(start.toISOString().slice(0, 16));
  await page.getByLabel('Visit end', { exact: true }).fill(end.toISOString().slice(0, 16));
  await page.getByRole('button', { name: 'Save visit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Visit details', exact: true })).toBeVisible();
  await page.getByLabel('Cancellation reason', { exact: true }).fill('Proceeding to reservation');
  await page.getByRole('button', { name: 'Save outcome', exact: true }).click();
  await expect(
    page.getByText('Cancellation: Proceeding to reservation', { exact: true }),
  ).toBeVisible();
  async function reserve() {
    await page.goto('/staff/property-deals/new');
    await page
      .getByRole('combobox', { name: 'Property choice', exact: true })
      .selectOption(String(property.id));
    await page.getByRole('combobox', { name: 'Lead choice', exact: true }).selectOption(leadId);
    await page.getByLabel('Agreed total', { exact: true }).fill('6500000.50');
    await page.getByLabel('Recorded advance', { exact: true }).fill('50000.25');
    await page.getByLabel('Payment reference', { exact: true }).fill('Synthetic receipt');
    await page.getByRole('button', { name: 'Save reservation', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Deal #/ })).toBeVisible();
  }
  await reserve();
  const cancelledUrl = page.url();
  expect((await page.request.get(`/api/v1/properties/${property.id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Cancel reservation', exact: true }).click();
  await page.getByLabel('Cancellation reason', { exact: true }).fill('Revised acceptance terms');
  await page.getByRole('button', { name: 'Yes, cancel reservation', exact: true }).click();
  await expect(
    page.getByText('Cancellation: Revised acceptance terms', { exact: true }),
  ).toBeVisible();
  expect((await page.request.get(`/api/v1/properties/${property.id}`)).status()).toBe(200);
  await reserve();
  await page.getByRole('button', { name: 'Confirm deal', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, confirm deal', exact: true }).click();
  await expect(page.getByText('Deal outcome saved.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel reservation', exact: true })).toHaveCount(
    0,
  );
  expect((await page.request.get(`/api/v1/properties/${property.id}`)).status()).toBe(404);
  await page.goto(cancelledUrl);
  await expect(
    page.getByText('Cancellation: Revised acceptance terms', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Staff sign in', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Staff sign in', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
