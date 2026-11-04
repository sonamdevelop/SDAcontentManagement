import { validCancellationHistory, type CancellationRequest } from '../domain/cancellations';
import { operationDate } from './operations';
import { StaffApi, StaffError } from './api';
import { VisitApi, type VisitEvent } from './visits';
import { money } from './deals';
export function bookingFilters(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const key of ['booking_id', 'stay_id', 'room_type_id']) {
    const value = values[key];
    if (value && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))))
      throw new Error('Use a positive whole-number ID.');
    if (value) params.set(key, value);
  }
  for (const key of ['arrival_from', 'arrival_to']) {
    const value = values[key];
    if (value) {
      operationDate(value);
      params.set(key, value);
    }
  }
  if (values.arrival_from && values.arrival_to && values.arrival_to < values.arrival_from)
    throw new Error('Arrival to must be on or after arrival from.');
  for (const key of ['status', 'attendance_status']) if (values[key]) params.set(key, values[key]);
  return params;
}
export type Room = {
  id: number;
  stay_id: number;
  name: string;
  inventory: number;
  capacity: number;
  nightly_rate: string;
  active: boolean;
};
export type Stay = {
  id: number;
  name: string;
  city: string;
  timezone: string;
  active: boolean;
  rooms: Room[];
};
export type Booking = {
  cancellation_requests?: CancellationRequest[];
  received_total?: string;
  refunded_total?: string;
  net_paid?: string;
  amount_due?: string;
  refund_due?: string;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
  attendance_status?: 'not_arrived' | 'checked_in' | 'checked_out';
  id: number;
  room_type_id: number;
  stay_name: string;
  room_name: string;
  timezone: string;
  check_in: string;
  check_out: string;
  rooms: number;
  guests: number;
  currency: string;
  nightly_rate: string;
  total: string;
  advance: string;
  balance: string;
  status: 'confirmed' | 'cancelled';
  guest_name?: string;
  guest_email?: string | null;
  guest_phone?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
  cancellation_reason?: string | null;
  events?: VisitEvent[];
};
export type Availability = {
  room_type_id: number;
  check_in: string;
  check_out: string;
  nights: number;
  timezone: string;
  nightly_rate: string;
  currency: string;
  capacity: number;
  available_rooms: number;
};
const validId = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const amount = (v: unknown) => typeof v === 'string' && /^\d{1,13}\.\d{2}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const validZone = (value: unknown) => {
  try {
    if (typeof value !== 'string') return false;
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
export function isStay(v: unknown): v is Stay {
  return (
    object(v) &&
    validId(v.id) &&
    ['name', 'city', 'timezone'].every((k) => typeof v[k] === 'string') &&
    validZone(v.timezone) &&
    typeof v.active === 'boolean' &&
    Array.isArray(v.rooms) &&
    v.rooms.every(
      (r) =>
        object(r) &&
        validId(r.id) &&
        r.stay_id === v.id &&
        typeof r.name === 'string' &&
        validId(r.inventory) &&
        validId(r.capacity) &&
        amount(r.nightly_rate) &&
        typeof r.active === 'boolean',
    )
  );
}
export function isBooking(v: unknown): v is Booking {
  if (
    !object(v) ||
    !validId(v.id) ||
    !validId(v.room_type_id) ||
    !['stay_name', 'room_name', 'currency'].every((k) => typeof v[k] === 'string') ||
    !validZone(v.timezone) ||
    !/^[A-Z]{3}$/.test(String(v.currency)) ||
    !validId(v.rooms) ||
    !validId(v.guests) ||
    !['nightly_rate', 'total', 'advance', 'balance'].every((k) => amount(v[k])) ||
    !['confirmed', 'cancelled'].includes(String(v.status))
  )
    return false;
  try {
    bookingWindow(String(v.check_in), String(v.check_out));
    for (const field of ['checked_in_at', 'checked_out_at']) {
      const value = v[field];
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
      )
        return false;
    }
    if (
      v.checked_out_at &&
      (!v.checked_in_at ||
        Date.parse(String(v.checked_out_at)) < Date.parse(String(v.checked_in_at)))
    )
      return false;
    if (
      v.attendance_status !== undefined &&
      v.attendance_status !== attendanceStatus(v as unknown as Booking)
    )
      return false;
    const cents = (key: string) => BigInt(String(v[key]).replace('.', ''));
    if (cents('total') <= 0n) return false;
    if (v.net_paid !== undefined) {
      if (
        !['received_total', 'refunded_total', 'net_paid', 'amount_due', 'refund_due'].every((k) =>
          amount(v[k]),
        )
      )
        return false;
      const due = v.status === 'cancelled' ? 0n : cents('total'),
        net = cents('received_total') - cents('refunded_total');
      return (
        cents('advance') <= cents('total') &&
        net >= 0n &&
        net <= cents('total') &&
        net === cents('net_paid') &&
        cents('amount_due') === due &&
        cents('balance') === (due > net ? due - net : 0n) &&
        cents('refund_due') === (net > due ? net - due : 0n)
      );
    }
    return cents('advance') + cents('balance') === cents('total');
  } catch {
    return false;
  }
}
export function bookingWindow(check_in: string, check_out: string) {
  const parse = (v: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Choose valid stay dates.');
    const ms = Date.parse(v + 'T00:00:00Z');
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== v)
      throw new Error('Choose valid stay dates.');
    return ms;
  };
  const nights = (parse(check_out) - parse(check_in)) / 86400000;
  if (nights < 1 || nights > 365) throw new Error('Choose a stay of 1 to 365 nights.');
  return { check_in, check_out };
}
export function quotedTotal(rate: string, rooms: number, nights: number) {
  if (!validId(rooms) || !validId(nights) || rooms > 1000 || nights > 365)
    throw new Error('Choose valid room quantity and dates.');
  const cents = BigInt(money(rate).replace('.', '')) * BigInt(rooms) * BigInt(nights);
  if (cents > 999999999999999n) throw new Error('Booking total exceeds the supported amount.');
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
export class PendingBooking {
  private pending?: { fingerprint: string; id: string };
  prepare(data: Record<string, unknown>) {
    const fingerprint = JSON.stringify(data);
    if (this.pending && this.pending.fingerprint !== fingerprint)
      throw new Error('Resolve the pending booking before changing it.');
    this.pending ||= { fingerprint, id: crypto.randomUUID() };
    return { ...data, request_id: this.pending.id };
  }
  resolved() {
    this.pending = undefined;
  }
}
export class StayApi {
  constructor(private api: StaffApi) {}
  stays(page = 1, signal?: AbortSignal) {
    return new VisitApi(this.api).page(`/admin/stays?page=${page}`, isStay, signal);
  }
  saveStay(data: Record<string, unknown>, id?: number) {
    return this.api.request(`/admin/stays${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    });
  }
  saveRoom(stay: number, data: Record<string, unknown>, id?: number) {
    return this.api.request(`/admin/stays/${stay}/rooms${id ? `/${id}` : ''}`, {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data),
    });
  }
  list(params: URLSearchParams, signal?: AbortSignal) {
    return new VisitApi(this.api).page(`/admin/stay-bookings?${params}`, isBooking, signal);
  }
  private detail(body: { data: unknown }) {
    if (
      !isBooking(body?.data) ||
      !validCancellationHistory(body.data.cancellation_requests, body.data.id) ||
      typeof body.data.guest_name !== 'string' ||
      !['guest_email', 'guest_phone', 'payment_reference', 'notes', 'cancellation_reason'].every(
        (k) => {
          const v = (body.data as unknown as Record<string, unknown>)[k];
          return v === null || typeof v === 'string';
        },
      ) ||
      !Array.isArray(body.data.events) ||
      !body.data.events.every(
        (e) =>
          object(e) &&
          validId(e.id) &&
          typeof e.action === 'string' &&
          typeof e.created_at === 'string' &&
          Number.isFinite(Date.parse(e.created_at)) &&
          (e.actor_id === null || validId(e.actor_id)) &&
          (e.customer_actor_id === undefined ||
            e.customer_actor_id === null ||
            validId(e.customer_actor_id)) &&
          object(e.changes) &&
          !Array.isArray(e.changes),
      )
    )
      throw new StaffError(502);
    return body.data;
  }
  async get(id: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(id)) throw new StaffError(404);
    return this.detail(await this.api.request(`/admin/stay-bookings/${id}`, { signal }));
  }
  async availability(
    id: number,
    dates: { check_in: string; check_out: string },
    signal?: AbortSignal,
  ) {
    const body = await this.api.request<{ data: Availability }>(
      `/admin/stay-rooms/${id}/availability?${new URLSearchParams(dates)}`,
      { signal },
    );
    const v = body?.data;
    if (
      !v ||
      v.room_type_id !== id ||
      !amount(v.nightly_rate) ||
      !validId(v.nights) ||
      v.nights > 365 ||
      !validId(v.capacity) ||
      v.capacity > 100 ||
      !Number.isSafeInteger(v.available_rooms) ||
      v.available_rooms < 0 ||
      v.available_rooms > 1000 ||
      v.check_in !== dates.check_in ||
      v.check_out !== dates.check_out ||
      typeof v.currency !== 'string' ||
      !validZone(v.timezone)
    )
      throw new StaffError(502);
    return v;
  }
  async reserve(data: Record<string, unknown>) {
    return this.detail(
      await this.api.request('/admin/stay-bookings', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    );
  }
  async attendance(id: number, action: 'check-in' | 'check-out') {
    if (!Number.isSafeInteger(id) || id < 1) throw new StaffError(404);
    return this.detail(
      await this.api.request(`/admin/stay-bookings/${id}/${action}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }),
    );
  }
  async cancel(id: number, reason: string) {
    return this.detail(
      await this.api.request(`/admin/stay-bookings/${id}/cancel`, {
        method: 'PATCH',
        body: JSON.stringify({ cancellation_reason: reason.trim() }),
      }),
    );
  }
}

export function attendanceStatus(booking: Booking) {
  return booking.checked_out_at
    ? 'checked_out'
    : booking.checked_in_at
      ? 'checked_in'
      : 'not_arrived';
}
export function localStayDate(timezone: string, now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(now));
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function canRecordAttendance(
  booking: Booking,
  action: 'check-in' | 'check-out',
  now = Date.now(),
) {
  if (booking.status !== 'confirmed') return false;
  if (action === 'check-out') return !!booking.checked_in_at && !booking.checked_out_at;
  const today = localStayDate(booking.timezone, now);
  return (
    !booking.checked_in_at &&
    !booking.checked_out_at &&
    booking.check_in <= today &&
    today < booking.check_out
  );
}
