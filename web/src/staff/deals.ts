import { StaffApi, StaffError, type Profile, can } from './api';
import { VisitApi, type VisitEvent } from './visits';
export const DEAL_STATUSES = ['reserved', 'confirmed', 'cancelled'] as const;
export type DealSummary = {
  id: number;
  property_id: number | null;
  lead_id: number | null;
  user_id: number | null;
  property_title: string;
  property_city: string;
  purpose: 'sale' | 'rent';
  rent_period: string | null;
  status: (typeof DEAL_STATUSES)[number];
  agreed_price: string;
  booking_amount: string;
  currency: string;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
};
export type Deal = DealSummary & {
  request_id: string;
  person_id: number | null;
  created_by: number | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  payment_reference: string | null;
  notes: string | null;
  cancellation_reason: string | null;
  events: VisitEvent[];
};
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const nullableId = (v: unknown) => v === null || id(v);
const text = (v: unknown) => v === null || typeof v === 'string';
const instant = (v: unknown) =>
  typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
export function money(value: string) {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(value))
    throw new Error('Enter money as up to 13 digits and two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return `${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
}
const cents = (v: string) => BigInt(v.replace('.', ''));
export function reservationPayload(values: {
  property_id: number;
  lead_id: number;
  agreed_price: string;
  booking_amount: string;
  payment_reference: string;
  notes: string;
}) {
  if (!id(values.property_id) || !id(values.lead_id))
    throw new Error('Choose a property and lead.');
  const agreed_price = money(values.agreed_price),
    booking_amount = money(values.booking_amount || '0');
  if (cents(agreed_price) === 0n || cents(booking_amount) > cents(agreed_price))
    throw new Error('Agreed price must be positive and advance cannot exceed it.');
  return {
    ...values,
    agreed_price,
    booking_amount,
    payment_reference: values.payment_reference.trim() || null,
    notes: values.notes.trim() || null,
  };
}
export function dealWriteAllowed(profile: Profile, action: 'create' | 'confirm' | 'cancel') {
  return [
    'deals.view',
    `deals.${action}`,
    'properties',
    'properties.edit',
    ...(action === 'cancel' ? [] : ['leads.view']),
    ...(action === 'create' ? ['leads'] : []),
  ].every((p) => can(profile, p));
}
export function isDealSummary(value: unknown): value is DealSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as DealSummary;
  return (
    id(v.id) &&
    [v.property_id, v.lead_id, v.user_id].every(nullableId) &&
    [v.property_title, v.property_city].every((x) => typeof x === 'string') &&
    ['sale', 'rent'].includes(v.purpose) &&
    text(v.rent_period) &&
    DEAL_STATUSES.includes(v.status) &&
    [v.agreed_price, v.booking_amount].every(
      (x) => typeof x === 'string' && /^\d{1,13}\.\d{2}$/.test(x),
    ) &&
    cents(v.agreed_price) > 0n &&
    cents(v.booking_amount) <= cents(v.agreed_price) &&
    typeof v.currency === 'string' &&
    /^[A-Z]{3}$/.test(v.currency) &&
    instant(v.created_at) &&
    [v.confirmed_at, v.cancelled_at].every((x) => x === null || instant(x))
  );
}
export function isDeal(value: unknown): value is Deal {
  if (!isDealSummary(value)) return false;
  const v = value as Deal;
  return (
    typeof v.request_id === 'string' &&
    [v.person_id, v.created_by].every(nullableId) &&
    typeof v.customer_name === 'string' &&
    [v.customer_email, v.customer_phone, v.payment_reference, v.notes, v.cancellation_reason].every(
      text,
    ) &&
    Array.isArray(v.events) &&
    v.events.every(
      (e) =>
        e &&
        id(e.id) &&
        nullableId(e.actor_id) &&
        typeof e.action === 'string' &&
        instant(e.created_at) &&
        !!e.changes &&
        typeof e.changes === 'object' &&
        !Array.isArray(e.changes),
    )
  );
}
// Kept only in component memory: an uncertain retry must use the original UUID/payload.
export class ReservationRequest {
  private previous?: { fingerprint: string; request_id: string };
  prepare(payload: ReturnType<typeof reservationPayload>) {
    const fingerprint = JSON.stringify(payload);
    if (this.previous && this.previous.fingerprint !== fingerprint)
      throw new Error('Resolve the pending reservation before changing its details.');
    this.previous ||= { fingerprint, request_id: crypto.randomUUID() };
    return { ...payload, request_id: this.previous.request_id };
  }
  resolved() {
    this.previous = undefined;
  }
}
export class DealApi {
  constructor(private api: StaffApi) {}
  list(params: URLSearchParams, signal?: AbortSignal) {
    return new VisitApi(this.api).page(`/admin/property-deals?${params}`, isDealSummary, signal);
  }
  private valid(body: { data: unknown }) {
    if (!isDeal(body?.data)) throw new StaffError(502);
    return body.data;
  }
  async detail(id: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(id)) throw new StaffError(404);
    return this.valid(
      await this.api.request<{ data: unknown }>(`/admin/property-deals/${id}`, { signal }),
    );
  }
  async reserve(payload: ReturnType<ReservationRequest['prepare']>) {
    return this.valid(
      await this.api.request<{ data: unknown }>('/admin/property-deals', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
  }
  async transition(id: number, action: 'confirm' | 'cancel', reason = '') {
    if (!Number.isSafeInteger(id) || id < 1) throw new StaffError(404);
    return this.valid(
      await this.api.request<{ data: unknown }>(`/admin/property-deals/${id}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify(action === 'cancel' ? { cancellation_reason: reason.trim() } : {}),
      }),
    );
  }
}
