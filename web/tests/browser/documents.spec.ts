import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { document as sampleDocument, pdf } from '../document-fixtures';
import { property } from '../fixtures';
const meta = { current_page: 1, last_page: 1, total: 1 };
const admin = {
  ...property(),
  address: 'Private road',
  owner_name: 'Owner',
  is_published: false,
  image_paths: [],
};
test('private documents upload, download and delete through authenticated requests', async ({
  page,
}, testInfo) => {
  let stored = false,
    removed = false;
  let uploads = 0;
  await page.addInitScript(() =>
    sessionStorage.setItem('sda.staff.token', 'browser-document-token'),
  );
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    expect(request.headers().authorization).toBe('Bearer browser-document-token');
    expect(request.headers().cookie).toBeUndefined();
    expect(url.search).not.toContain('token');
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
      await route.fulfill({ json: { data: [admin], meta } });
      return;
    }
    if (path === '/api/v1/admin/properties/7') {
      await route.fulfill({ json: { data: admin } });
      return;
    }
    if (path === '/api/v1/admin/properties/7/documents/41/download') {
      await route.fulfill({
        body: pdf,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(Buffer.byteLength(pdf)),
          'Cache-Control': 'private, no-store',
        },
      });
      return;
    }
    if (path === '/api/v1/admin/properties/7/documents/41' && request.method() === 'DELETE') {
      removed = true;
      await route.fulfill({ status: 204 });
      return;
    }
    if (path === '/api/v1/admin/properties/7/documents' && request.method() === 'POST') {
      uploads++;
      expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=');
      const body = request.postDataBuffer()!.toString();
      expect(body).toContain('filename="agreement.pdf"');
      expect(body).toContain('Private agreement');
      if (uploads === 1) {
        await route.fulfill({
          status: 422,
          json: { errors: { file: ['Please choose a valid PDF.'] } },
        });
        return;
      }
      stored = true;
      await route.fulfill({
        status: 201,
        json: { data: { ...sampleDocument, title: 'Private agreement' } },
      });
      return;
    }
    if (path === '/api/v1/admin/properties/7/documents') {
      await route.fulfill({
        json: {
          data:
            stored && !removed
              ? [
                  {
                    ...sampleDocument,
                    title: 'Private agreement',
                    download_url: 'https://untrusted.example/download',
                  },
                ]
              : [],
          meta: { ...meta, total: stored && !removed ? 1 : 0 },
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: {} });
  });
  await page.goto('/staff/properties');
  await page.getByRole('link', { name: 'Private documents', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Document title', exact: true })
    .fill('Private agreement');
  await page
    .getByRole('combobox', { name: 'Upload category', exact: true })
    .selectOption('agreement');
  await page.getByLabel('Document file', { exact: true }).setInputFiles({
    name: 'agreement.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(pdf),
  });
  await page.getByRole('button', { name: 'Upload document', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('valid PDF');
  await expect(page.getByRole('textbox', { name: 'Document title', exact: true })).toHaveValue(
    'Private agreement',
  );
  await page.getByRole('button', { name: 'Upload document', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Private agreement', exact: true })).toBeVisible();
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download document', exact: true }).click();
  const downloaded = await waiting;
  expect(downloaded.suggestedFilename()).toBe('agreement.pdf');
  const target = testInfo.outputPath('private-agreement.pdf');
  await downloaded.saveAs(target);
  expect(await fs.readFile(target, 'utf8')).toBe(pdf);
  expect(await page.locator('a[href*="token"]').count()).toBe(0);
  await page
    .getByRole('combobox', { name: 'Document category', exact: true })
    .selectOption('agreement');
  await page.getByRole('button', { name: 'Filter documents', exact: true }).click();
  await expect(page).toHaveURL(/category=agreement/);
  await page.getByRole('button', { name: 'Delete document', exact: true }).click();
  await page.getByRole('button', { name: 'Keep document', exact: true }).click();
  expect(removed).toBe(false);
  await page.getByRole('button', { name: 'Delete document', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await expect(page.getByText('Document deleted.', { exact: true })).toBeVisible();
  await expect(page.getByText('No matching documents.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('read-only staff see download errors without upload or delete actions', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('sda.staff.token', 'reader-token'));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/me')) {
      await route.fulfill({
        json: {
          data: {
            id: 1,
            name: 'Reader',
            email: 'reader@example.test',
            role: {
              name: 'Reader',
              permission_type: 'custom',
              permissions: ['properties', 'properties.documents'],
            },
          },
        },
      });
      return;
    }
    if (path.endsWith('/download')) {
      await route.fulfill({ status: 403, json: {} });
      return;
    }
    if (path.endsWith('/documents')) {
      await route.fulfill({ json: { data: [sampleDocument], meta } });
      return;
    }
    await route.fulfill({ json: { data: admin } });
  });
  await page.goto('/staff/properties/7/documents');
  await expect(page.getByRole('button', { name: 'Upload document', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete document', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Download document', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('do not have permission');
  await expect(
    page.getByRole('heading', { name: sampleDocument.title, exact: true }),
  ).toBeVisible();
});
