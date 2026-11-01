import { StaffApi, StaffError, type Page } from './api';
import { dueTimestamp } from './leads';
export const VISIT_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export type VisitSummary = {
  id: number;
  property_id: number | null;
  property_title: string;
  property_city: string;
  lead_id: number | null;
  customer_name: string;
  user_id: number | null;
  status: VisitStatus;
  starts_at: string;
  ends_at: string;
  reschedule_count: number;
  created_at: string;
};
export type VisitEvent = {
  id: number;
  actor_id: number | null;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
};
export type Visit = VisitSummary & {
  customer_email: string | null;
  customer_phone: string | null;
  notes: string | null;
  feedback: string | null;
  cancellation_reason: string | null;
  reschedule_reason: string | null;
  events: VisitEvent[];
};
export type Choice = { id: number; name: string };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const nullableId = (v: unknown) => v === null || id(v);
const nullableText = (v: unknown) => v === null || typeof v === 'string';
const instant = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
export function isVisitSummary(v: unknown): v is VisitSummary {
  return (
    object(v) &&
    id(v.id) &&
    ['property_id', 'lead_id', 'user_id'].every((k) => nullableId(v[k])) &&
    ['property_title', 'property_city', 'customer_name'].every((k) => typeof v[k] === 'string') &&
    VISIT_STATUSES.includes(v.status as VisitStatus) &&
    instant(v.starts_at) &&
    instant(v.ends_at) &&
    Number.isSafeInteger(v.reschedule_count) &&
    Number(v.reschedule_count) >= 0 &&
    instant(v.created_at)
  );
}
export function isVisit(v: unknown): v is Visit {
  if (!isVisitSummary(v)) return false;
  const detail = v as unknown as Record<string, unknown>;
  return (
    [
      'customer_email',
      'customer_phone',
      'notes',
      'feedback',
      'cancellation_reason',
      'reschedule_reason',
    ].every((k) => nullableText(detail[k])) &&
    Array.isArray(detail.events) &&
    detail.events.every(
      (e) =>
        object(e) &&
        id(e.id) &&
        nullableId(e.actor_id) &&
        typeof e.action === 'string' &&
        object(e.changes) &&
        !Array.isArray(e.changes) &&
        instant(e.created_at),
    )
  );
}
export function visitWindow(start: string, end: string, now = Date.now()) {
  const starts_at = dueTimestamp(start),
    ends_at = dueTimestamp(end);
  const duration = Date.parse(ends_at) - Date.parse(starts_at);
  if (Date.parse(starts_at) <= now || duration <= 0 || duration > 8 * 3600000)
    throw new Error(
      'Choose a future visit with an end time after its start, lasting no more than 8 hours.',
    );
  return { starts_at, ends_at };
}
export function terminalAvailable(visit: VisitSummary, now = Date.now()) {
  return Date.parse(visit.starts_at) <= now;
}
export class VisitApi {
  constructor(private api: StaffApi) {}
  async page<T>(path: string, check: (v: unknown) => v is T, signal?: AbortSignal) {
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
  list(query: URLSearchParams, signal?: AbortSignal) {
    return this.page(`/admin/site-visits?${query}`, isVisitSummary, signal);
  }
  async detail(visitId: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(visitId)) throw new StaffError(404);
    return this.valid(
      await this.api.request<{ data: unknown }>(`/admin/site-visits/${visitId}`, { signal }),
    );
  }
  private valid(body: { data: unknown }) {
    if (!isVisit(body?.data)) throw new StaffError(502);
    return body.data;
  }
  async save(
    data: Record<string, unknown>,
    visitId?: number,
    action?: 'schedule' | 'assignment' | 'status' | 'feedback',
  ) {
    return this.valid(
      await this.api.request<{ data: unknown }>(
        `/admin/site-visits${visitId ? `/${visitId}/${action}` : ''}`,
        { method: visitId ? 'PATCH' : 'POST', body: JSON.stringify(data) },
      ),
    );
  }
  async choices(
    kind: 'properties' | 'leads' | 'agents',
    page: number,
    q: string,
    signal?: AbortSignal,
  ) {
    const params = new URLSearchParams({ page: String(page) });
    if (kind !== 'agents' && q) params.set('q', q);
    if (kind === 'properties') params.set('status', 'available');
    const body = await this.page(
      `/admin/${kind === 'agents' ? 'site-visit-agents' : kind}?${params}`,
      (v): v is Choice & { title?: string; city?: string } =>
        object(v) && id(v.id) && typeof v[kind === 'agents' ? 'name' : 'title'] === 'string',
      signal,
    );
    return {
      ...body,
      data: body.data.map((v) => ({
        id: v.id,
        name: kind === 'agents' ? v.name : `${v.title}${v.city ? ` · ${v.city}` : ''}`,
      })),
    };
  }
}
