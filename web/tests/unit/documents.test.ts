import { afterEach, expect, it, vi } from 'vitest';
import { StaffApi } from '../../src/staff/api';
import {
  attachmentName,
  checkDocumentFile,
  documentForm,
  DocumentApi,
  DOCUMENT_MAX_BYTES,
  isDocument,
} from '../../src/staff/documents';
import { document } from '../document-fixtures';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('validates private metadata against its parent property and file policy', () => {
  expect(isDocument(document, 7)).toBe(true);
  expect(isDocument(document, 8)).toBe(false);
  expect(isDocument({ ...document, sha256: 'invalid' }, 7)).toBe(false);
  expect(isDocument({ ...document, mime_type: 'text/html' }, 7)).toBe(false);
  expect(isDocument({ ...document, size_bytes: DOCUMENT_MAX_BYTES + 1 }, 7)).toBe(false);
});
it('validates upload size, extension and reported MIME without treating them as server validation', () => {
  expect(() => checkDocumentFile(null)).toThrow('Choose a document');
  expect(() => checkDocumentFile(new File(['html'], 'x.pdf', { type: 'text/html' }))).toThrow(
    'matching file extension',
  );
  expect(() =>
    checkDocumentFile(new File(['data'], 'x.exe', { type: 'application/pdf' })),
  ).toThrow();
  expect(() =>
    checkDocumentFile(
      new File([new Uint8Array(DOCUMENT_MAX_BYTES + 1)], 'x.pdf', { type: 'application/pdf' }),
    ),
  ).toThrow('10 MB');
  expect(() => checkDocumentFile(new File(['pdf'], 'x.PDF'))).not.toThrow();
});
it('encodes private uploads as multipart without a public photo path', () => {
  const file = new File(['pdf'], 'registry.pdf', { type: 'application/pdf' });
  const form = documentForm(' Registry ', 'registry', ' Details ', file);
  expect([...form.keys()]).toEqual(['title', 'category', 'description', 'file']);
  expect(form.get('file')).toBe(file);
  expect(form.get('title')).toBe('Registry');
});
it('sanitizes attachment filenames and uses the known file extension', () => {
  expect(attachmentName('../../agreement.exe', 'application/pdf')).toBe('agreement.pdf');
  expect(attachmentName('..\\copy\u202e\u0000.jpg', 'image/jpeg')).toBe('copy__.jpg');
  expect(attachmentName('...', 'image/png')).toBe('document.png');
});
it('downloads from a constructed authenticated path, ignoring arbitrary download URLs', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'application/pdf' } }),
    );
  vi.stubGlobal('fetch', fetch);
  await new StaffApi('private-token').documentFile(7, 41);
  expect(fetch.mock.calls[0][0]).toBe(
    'http://localhost:5173/api/v1/admin/properties/7/documents/41/download',
  );
  expect(fetch.mock.calls[0][1]).toMatchObject({
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    headers: { Authorization: 'Bearer private-token' },
  });
});
it('clears rejected download sessions and rejects HTML or oversized responses', async () => {
  const clear = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  await expect(new StaffApi('expired', clear).documentFile(7, 41)).rejects.toMatchObject({
    status: 401,
  });
  expect(clear).toHaveBeenCalledOnce();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response('<html/>', { headers: { 'Content-Type': 'text/html' } })),
  );
  await expect(new StaffApi().documentFile(7, 41)).rejects.toMatchObject({ status: 502 });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response('', {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(DOCUMENT_MAX_BYTES + 1),
        },
      }),
    ),
  );
  await expect(new StaffApi().documentFile(7, 41)).rejects.toMatchObject({ status: 502 });
});
it('checks byte count before offering an authenticated download', async () => {
  const api = new StaffApi();
  vi.spyOn(api, 'documentFile').mockResolvedValue(
    new Blob(['changed'], { type: 'application/pdf' }),
  );
  await expect(new DocumentApi(api).download(document)).rejects.toMatchObject({ status: 502 });
});
it('rejects malformed pages and keeps deletion scoped to the property', async () => {
  const api = new StaffApi();
  const request = vi.spyOn(api, 'request').mockResolvedValue({
    data: [{ ...document, property_id: 8 }],
    meta: { current_page: 1, last_page: 1, total: 1 },
  });
  await expect(new DocumentApi(api).list(7, new URLSearchParams())).rejects.toMatchObject({
    status: 502,
  });
  request.mockResolvedValue(undefined);
  await new DocumentApi(api).remove(7, 41);
  expect(request).toHaveBeenLastCalledWith('/admin/properties/7/documents/41', {
    method: 'DELETE',
  });
});
