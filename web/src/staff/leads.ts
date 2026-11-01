import { StaffApi, StaffError, type Page } from './api';
export type Option = { id: number; name: string };
export type Stage = Option & { code: string };
export type Pipeline = Option & { stages: Stage[] };
export type LeadDetail = {
  id: number;
  title: string;
  description: string | null;
  lead_value: string;
  currency: string;
  user_id: number | null;
  agent: Option | null;
  pipeline: Option | null;
  stage: Stage | null;
  lost_reason: string | null;
  closed_at: string | null;
  expected_close_date: string | null;
  contact: {
    name: string;
    emails: { value: string; label?: string }[];
    contact_numbers: { value: string; label?: string }[];
  } | null;
};
export type FollowUp = {
  id: number;
  lead_ids: number[];
  type: 'note' | 'task';
  title: string | null;
  comment: string;
  due_at: string | null;
  is_done: boolean;
  is_overdue: boolean;
  user_id: number | null;
};
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';
const id = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const nullableString = (value: unknown) => value === null || typeof value === 'string';
const option = (value: unknown): value is Option =>
  object(value) && id(value.id) && typeof value.name === 'string';
export function isLead(value: unknown): value is LeadDetail {
  if (!object(value)) return false;
  return (
    id(value.id) &&
    typeof value.title === 'string' &&
    typeof value.lead_value === 'string' &&
    typeof value.currency === 'string' &&
    nullableString(value.description) &&
    nullableString(value.lost_reason) &&
    nullableString(value.closed_at) &&
    nullableString(value.expected_close_date) &&
    (value.agent === null || option(value.agent)) &&
    (value.pipeline === null || option(value.pipeline)) &&
    (value.stage === null ||
      (option(value.stage) && typeof (value.stage as Stage).code === 'string')) &&
    (value.contact === null ||
      (object(value.contact) &&
        typeof value.contact.name === 'string' &&
        ['emails', 'contact_numbers'].every(
          (key) =>
            Array.isArray(value.contact && (value.contact as Record<string, unknown>)[key]) &&
            ((value.contact as Record<string, unknown>)[key] as unknown[]).every(
              (item) => object(item) && typeof item.value === 'string',
            ),
        )))
  );
}
export function isFollowUp(value: unknown): value is FollowUp {
  return (
    object(value) &&
    id(value.id) &&
    Array.isArray(value.lead_ids) &&
    value.lead_ids.every(id) &&
    ['note', 'task'].includes(String(value.type)) &&
    nullableString(value.title) &&
    typeof value.comment === 'string' &&
    nullableString(value.due_at) &&
    typeof value.is_done === 'boolean' &&
    typeof value.is_overdue === 'boolean'
  );
}
export function localDateInput(iso: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
export function dueTimestamp(local: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(local))
    throw new Error('Choose a valid due date and time.');
  const date = new Date(local);
  if (
    !Number.isFinite(date.getTime()) ||
    localDateInput(date.toISOString()) !== (local.length === 16 ? local + ':00' : local)
  )
    throw new Error('This local time does not exist. Choose another time.');
  return date.toISOString().replace('.000Z', 'Z');
}
export class LeadApi {
  constructor(private api: StaffApi) {}
  async detail(leadId: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(leadId)) throw new StaffError(404);
    return this.leadResponse(
      await this.api.request<{ data: unknown }>(`/admin/leads/${leadId}`, { signal }),
    );
  }
  private leadResponse(body: { data: unknown }) {
    if (!isLead(body?.data)) throw new StaffError(502);
    return body.data;
  }
  async update(leadId: number, action: 'assignment' | 'stage', data: Record<string, unknown>) {
    return this.leadResponse(
      await this.api.request<{ data: unknown }>(`/admin/leads/${leadId}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    );
  }
  async pipelines(signal?: AbortSignal) {
    const body = await this.api.request<{ data: Pipeline[] }>('/admin/lead-pipelines', { signal });
    if (
      !Array.isArray(body?.data) ||
      !body.data.every(
        (p) =>
          option(p) &&
          Array.isArray(p.stages) &&
          p.stages.every((s) => option(s) && typeof s.code === 'string'),
      )
    )
      throw new StaffError(502);
    return body.data;
  }
  async page<T>(path: string, check: (value: unknown) => value is T, signal?: AbortSignal) {
    const body = await this.api.request<Page<T>>(path, { signal });
    if (
      !Array.isArray(body?.data) ||
      !body.data.every(check) ||
      !body.meta ||
      !id(body.meta.current_page) ||
      !id(body.meta.last_page) ||
      !Number.isSafeInteger(body.meta.total) ||
      body.meta.total < 0
    )
      throw new StaffError(502);
    return body;
  }
  assignees(page: number, signal?: AbortSignal) {
    return this.page(`/admin/lead-assignees?page=${page}`, option, signal);
  }
  followUps(params: URLSearchParams, leadId?: number, signal?: AbortSignal) {
    return this.page(
      `/admin/${leadId ? `leads/${leadId}/` : ''}follow-ups?${params}`,
      isFollowUp,
      signal,
    );
  }
  async saveFollowUp(leadId: number, data: Record<string, unknown>, activityId?: number) {
    const body = await this.api.request<{ data: unknown }>(
      `/admin/leads/${leadId}/follow-ups${activityId ? `/${activityId}` : ''}`,
      { method: activityId ? 'PATCH' : 'POST', body: JSON.stringify(data) },
    );
    if (!isFollowUp(body?.data)) throw new StaffError(502);
    return body.data;
  }
}

// CRM lead values use DECIMAL(12,4), unlike property prices with two decimals.
export function formatLeadValue(value: string, currency: string): string {
  const match = /^(\d{1,13})(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) return 'Value unavailable';
  const whole = match[1],
    fraction = (match[2] || '').replace(/0+$/, '');
  const digits = fraction ? Math.max(2, fraction.length) : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
      .formatToParts(BigInt(whole))
      .map((part) => (part.type === 'fraction' ? fraction.padEnd(digits, '0') : part.value))
      .join('');
  } catch {
    return `${currency} ${value}`;
  }
}
