import { StaffApi, StaffError, type Page } from './api';
export const DOCUMENT_CATEGORIES = [
  'registry',
  'agreement',
  'floor_plan',
  'ownership_proof',
  'other',
] as const;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_TYPES = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
} as const;
export type PropertyDocument = {
  id: number;
  property_id: number;
  title: string;
  category: (typeof DOCUMENT_CATEGORIES)[number];
  description: string | null;
  original_name: string;
  mime_type: keyof typeof DOCUMENT_TYPES;
  size_bytes: number;
  sha256: string;
  uploaded_by: number | null;
  created_at: string | null;
};
export function isDocument(value: unknown, propertyId: number): value is PropertyDocument {
  if (!value || typeof value !== 'object') return false;
  const d = value as PropertyDocument;
  return (
    Number.isSafeInteger(d.id) &&
    d.id > 0 &&
    d.property_id === propertyId &&
    typeof d.title === 'string' &&
    DOCUMENT_CATEGORIES.includes(d.category) &&
    (d.description === null || typeof d.description === 'string') &&
    typeof d.original_name === 'string' &&
    Object.hasOwn(DOCUMENT_TYPES, d.mime_type) &&
    Number.isSafeInteger(d.size_bytes) &&
    d.size_bytes >= 0 &&
    d.size_bytes <= DOCUMENT_MAX_BYTES &&
    typeof d.sha256 === 'string' &&
    /^[a-f0-9]{64}$/i.test(d.sha256) &&
    (d.uploaded_by === null || (Number.isSafeInteger(d.uploaded_by) && d.uploaded_by > 0)) &&
    (d.created_at === null ||
      (typeof d.created_at === 'string' && Number.isFinite(Date.parse(d.created_at))))
  );
}
export function checkDocumentFile(file: File | null) {
  if (!file) throw new Error('Choose a document to upload.');
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error('The document must be 10 MB or smaller.');
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const known = Object.entries(DOCUMENT_TYPES).some(
    ([mime, extensions]) =>
      (!file.type || file.type === mime) &&
      (extensions as readonly string[]).includes(extension || ''),
  );
  if (!known) throw new Error('Choose a PDF, JPEG or PNG with the matching file extension.');
}
export function documentForm(
  title: string,
  category: string,
  description: string,
  file: File | null,
) {
  checkDocumentFile(file);
  const form = new FormData();
  form.set('title', title.trim());
  form.set('category', category);
  if (description.trim()) form.set('description', description.trim());
  form.set('file', file!);
  return form;
}
export function attachmentName(name: string, mime: keyof typeof DOCUMENT_TYPES) {
  const base = name.replaceAll('\\', '/').split('/').at(-1) || 'document';
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base)
    .replace(/[\p{Cc}\p{Cf}<>:"|?*]/gu, '_')
    .slice(0, 180)
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '');
  return `${stem || 'document'}.${DOCUMENT_TYPES[mime][0]}`;
}
export class DocumentApi {
  constructor(private api: StaffApi) {}
  private path(propertyId: number) {
    if (!Number.isSafeInteger(propertyId) || propertyId < 1) throw new StaffError(404);
    return `/admin/properties/${propertyId}/documents`;
  }
  async list(propertyId: number, query: URLSearchParams, signal?: AbortSignal) {
    const body = await this.api.request<Page<PropertyDocument>>(
      `${this.path(propertyId)}?${query}`,
      { signal },
    );
    if (
      !Array.isArray(body?.data) ||
      !body.data.every((d) => isDocument(d, propertyId)) ||
      !body.meta ||
      ![body.meta.current_page, body.meta.last_page].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      !Number.isSafeInteger(body.meta.total) ||
      body.meta.total < 0
    )
      throw new StaffError(502);
    return body;
  }
  async upload(propertyId: number, form: FormData) {
    const body = await this.api.request<{ data: unknown }>(this.path(propertyId), {
      method: 'POST',
      body: form,
    });
    if (!isDocument(body?.data, propertyId)) throw new StaffError(502);
    return body.data;
  }
  async download(document: PropertyDocument, signal?: AbortSignal) {
    const blob = await this.api.documentFile(document.property_id, document.id, signal);
    if (blob.type.split(';')[0] !== document.mime_type || blob.size !== document.size_bytes)
      throw new StaffError(502);
    return blob;
  }
  async remove(propertyId: number, documentId: number) {
    if (!Number.isSafeInteger(documentId) || documentId < 1) throw new StaffError(404);
    await this.api.request(`${this.path(propertyId)}/${documentId}`, { method: 'DELETE' });
  }
}
