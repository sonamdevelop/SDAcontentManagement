import { isProperty, type Property, type PropertyPage } from '../domain/property';
import { filterParams, PAGE_SIZE, type Filters } from '../domain/filters';
import { normalizeEnquiry, type EnquiryDraft, type FieldErrors } from '../domain/enquiry';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly fields: FieldErrors = {},
    public readonly retryAfter: number | null = null,
  ) {
    super(`Property request failed (${status})`);
    this.name = 'ApiError';
  }
}
export class PublicPropertyApi {
  constructor(private readonly base = '/api/v1') {}
  get baseUrl(): string {
    const url = new URL(this.base, window.location.origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new ApiError(0);
    return url.href.replace(/\/$/, '');
  }
  private async request(path: string, options: RequestInit, expected = 200): Promise<unknown> {
    const response = await fetch(this.baseUrl + path, {
      ...options,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError(response.ok ? 502 : response.status);
    }
    if (!response.ok) {
      const fields: FieldErrors = {};
      if (
        body &&
        typeof body === 'object' &&
        'errors' in body &&
        body.errors &&
        typeof body.errors === 'object'
      ) {
        for (const name of ['name', 'email', 'phone', 'message', 'consent'] as const) {
          const errors = (body.errors as Record<string, unknown>)[name];
          if (Array.isArray(errors) && typeof errors[0] === 'string') fields[name] = errors[0];
        }
      }
      const retry = response.headers.get('Retry-After');
      const seconds = retry && /^\d+$/.test(retry) ? Math.min(Number(retry), 3600) : null;
      throw new ApiError(response.status, fields, seconds);
    }
    if (response.status !== expected) throw new ApiError(502);
    return body;
  }
  async list(filters: Filters, signal?: AbortSignal): Promise<PropertyPage> {
    const params = filterParams(filters);
    params.set('per_page', String(PAGE_SIZE));
    const body = (await this.request(`/properties?${params}`, { signal })) as PropertyPage;
    if (
      !body ||
      !Array.isArray(body.data) ||
      !body.data.every(isProperty) ||
      !body.meta ||
      ![body.meta.current_page, body.meta.last_page, body.meta.per_page].every(
        (n) => Number.isSafeInteger(n) && n > 0,
      ) ||
      !Number.isSafeInteger(body.meta.total) ||
      body.meta.total < 0
    )
      throw new ApiError(502);
    return body;
  }
  async property(id: string, signal?: AbortSignal): Promise<Property> {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new ApiError(404);
    const body = (await this.request(`/properties/${id}`, { signal })) as { data?: unknown };
    if (!body || !isProperty(body.data)) throw new ApiError(502);
    return body.data;
  }
  async enquire(id: number, draft: EnquiryDraft, key: string, signal?: AbortSignal): Promise<void> {
    await this.request(
      `/properties/${id}/enquiries`,
      {
        method: 'POST',
        signal,
        body: JSON.stringify({ ...normalizeEnquiry(draft), submission_id: key }),
      },
      202,
    );
  }
}
export const publicApi = new PublicPropertyApi(import.meta.env.VITE_PROPERTY_API_URL || '/api/v1');
