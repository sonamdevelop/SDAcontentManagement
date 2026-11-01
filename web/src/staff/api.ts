import { PublicPropertyApi } from '../api/client';
import { isProperty, type Property } from '../domain/property';
export type Profile = {
  id: number;
  name: string;
  email: string;
  role: { name: string; permission_type: string; permissions: string[] };
};
export type AdminProperty = Omit<Property, 'status'> & {
  status: string;
  address: string;
  postal_code: string | null;
  owner_name: string;
  owner_phone: string | null;
  is_published: boolean;
  image_paths: string[];
};
export type Page<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
};
export type Enquiry = {
  id: number;
  property_title: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  lead_id: number | null;
  created_at: string;
};
export type Lead = {
  id: number;
  title: string;
  lead_value: string;
  currency: string;
  agent: { name: string } | null;
  stage: { name: string } | null;
};
export type Overview = {
  data: Record<string, Record<string, number> | null>;
  meta: { as_of: string; period: { timezone: string } };
};
export const can = (profile: Profile, permission: string) =>
  profile.role.permission_type === 'all' || profile.role.permissions.includes(permission);
export class StaffError extends Error {
  constructor(
    public status: number,
    public fields: Record<string, string[]> = {},
  ) {
    super(
      status === 401
        ? 'Your session expired. Please sign in again.'
        : status === 403
          ? 'You do not have permission for this action.'
          : status === 422
            ? 'Please check the highlighted fields.'
            : status === 429
              ? 'Too many requests. Please wait before trying again.'
              : 'Request failed. Please try again.',
    );
  }
}
export function isAdminProperty(p: unknown): p is AdminProperty {
  if (!p || typeof p !== 'object') return false;
  const v = p as AdminProperty;
  return (
    isProperty({ ...v, status: 'available' }) &&
    ['available', 'reserved', 'sold', 'rented', 'unavailable'].includes(v.status) &&
    typeof v.address === 'string' &&
    typeof v.owner_name === 'string' &&
    typeof v.is_published === 'boolean' &&
    Array.isArray(v.image_paths) &&
    v.image_paths.every((x) => typeof x === 'string')
  );
}
export class StaffApi {
  constructor(
    private token = '',
    private unauthorized: () => void = () => {},
  ) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(
      new PublicPropertyApi(import.meta.env.VITE_PROPERTY_API_URL || '/api/v1').baseUrl + path,
      {
        ...options,
        credentials: 'omit',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(options.body && !(options.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
      },
    );
    if (response.status === 401) this.unauthorized();
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const fields: Record<string, string[]> = {};
      if (body?.errors && typeof body.errors === 'object')
        for (const [key, value] of Object.entries(body.errors))
          if (Array.isArray(value) && value.every((x) => typeof x === 'string'))
            fields[key] = value;
      throw new StaffError(response.status, fields);
    }
    if (!body) throw new StaffError(502);
    return body as T;
  }
  async me(signal?: AbortSignal) {
    const { data } = await this.request<{ data: Profile }>('/auth/me', { signal });
    if (
      !data ||
      !Number.isSafeInteger(data.id) ||
      typeof data.name !== 'string' ||
      !data.role ||
      !Array.isArray(data.role.permissions)
    )
      throw new StaffError(502);
    return data;
  }
  async property(id: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(id)) throw new StaffError(404);
    const { data } = await this.request<{ data: unknown }>(`/admin/properties/${id}`, { signal });
    if (!isAdminProperty(data)) throw new StaffError(502);
    return data;
  }
  async save(form: FormData, id?: string) {
    if (id) form.set('_method', 'PUT');
    const { data } = await this.request<{ data: unknown }>(
      `/admin/properties${id ? `/${id}` : ''}`,
      { method: 'POST', body: form },
    );
    if (!isAdminProperty(data)) throw new StaffError(502);
    return data;
  }
}
export function propertyForm(
  values: Record<string, string>,
  published: boolean,
  enquiries: boolean,
  photos: File[],
  removed: string[],
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values))
    if (key !== 'rent_period' || values.purpose === 'rent') form.set(key, value);
  form.set('is_published', published ? '1' : '0');
  form.set('accepts_enquiries', enquiries ? '1' : '0');
  photos.forEach((file) => form.append('photos[]', file));
  removed.forEach((path) => form.append('remove_images[]', path));
  return form;
}
