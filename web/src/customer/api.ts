import { isCustomerAvailability, type ReservationDraft } from './reservation';
import { publicApi } from '../api/client';
import { isBooking, quotedTotal, type Booking } from '../staff/stays';
import { isFinancialSummary, type FinancialSummary } from '../staff/payments';
export type Customer = { id: number; name: string; email: string; phone: string | null };
export type CustomerBooking = Pick<
  Booking,
  | 'id'
  | 'stay_name'
  | 'room_name'
  | 'timezone'
  | 'check_in'
  | 'check_out'
  | 'rooms'
  | 'guests'
  | 'nightly_rate'
  | 'attendance_status'
  | 'checked_in_at'
  | 'checked_out_at'
> &
  FinancialSummary & { guest_name: string; room_type_id?: number };
export type CustomerBookingPage = {
  data: CustomerBooking[];
  meta: { current_page: number; last_page: number; total: number };
};
export class CustomerError extends Error {
  constructor(
    public status: number,
    public fields: Record<string, string[]> = {},
  ) {
    super(
      status === 401
        ? 'Sign in with your customer email and password.'
        : status === 403
          ? 'This customer account or action is unavailable.'
          : status === 404
            ? 'This booking is not available to your account.'
            : status === 422
              ? 'Please check the form fields.'
              : status === 429
                ? 'Too many attempts. Please wait before trying again.'
                : 'Could not confirm the request. Please try again.',
    );
  }
}
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
export function isCustomer(v: unknown): v is Customer {
  if (!v || typeof v !== 'object') return false;
  const r = v as Customer;
  return (
    id(r.id) &&
    typeof r.name === 'string' &&
    typeof r.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) &&
    (r.phone === null || typeof r.phone === 'string')
  );
}
export function isCustomerBooking(v: unknown): v is CustomerBooking {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as CustomerBooking).guest_name === 'string' &&
    isFinancialSummary(v) &&
    isBooking({ ...v, room_type_id: (v as CustomerBooking).room_type_id ?? 1 })
  );
}
export class CustomerApi {
  constructor(
    private token = '',
    private expired?: () => void,
  ) {}
  private async request(
    path: string,
    options: RequestInit = {},
    authenticated = true,
    expected: number | number[] = 200,
  ) {
    if (authenticated && !this.token) throw new CustomerError(401);
    const response = await fetch(publicApi.baseUrl + '/customer' + path, {
      ...options,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authenticated ? { Authorization: `Bearer ${this.token}` } : {}),
      },
    });
    if (authenticated && response.status === 401) this.expired?.();
    if (
      response.ok &&
      !(Array.isArray(expected) ? expected.includes(response.status) : response.status === expected)
    )
      throw new CustomerError(502);
    if (response.ok && response.status === 204) return null;
    let body;
    try {
      body = await response.json();
    } catch {
      throw new CustomerError(response.ok ? 502 : response.status);
    }
    if (!response.ok) {
      const fields: Record<string, string[]> = {};
      if (body?.errors && typeof body.errors === 'object')
        for (const [key, messages] of Object.entries(body.errors)) {
          if (Array.isArray(messages) && messages.every((m) => typeof m === 'string'))
            fields[key] = messages;
        }
      throw new CustomerError(response.status, fields);
    }
    return body;
  }
  async authenticate(action: 'login' | 'register', values: Record<string, string>) {
    const body = await this.request(
        `/auth/${action}`,
        { method: 'POST', body: JSON.stringify({ ...values, device_name: 'SDA customer web' }) },
        false,
        201,
      ),
      data = body?.data;
    if (
      !data ||
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      data.token_type !== 'Bearer' ||
      typeof data.expires_at !== 'string' ||
      !Number.isFinite(Date.parse(data.expires_at))
    )
      throw new CustomerError(502);
    return data.access_token as string;
  }
  async me(signal?: AbortSignal) {
    const body = await this.request('/me', { signal });
    if (!isCustomer(body?.data)) throw new CustomerError(502);
    return body.data;
  }
  async profile(values: { name: string; phone: string }) {
    const body = await this.request('/me', { method: 'PATCH', body: JSON.stringify(values) });
    if (!isCustomer(body?.data)) throw new CustomerError(502);
    return body.data;
  }
  async password(values: Record<string, string>) {
    await this.request('/password', { method: 'POST', body: JSON.stringify(values) }, true, 204);
  }
  async logout() {
    await this.request('/auth/logout', { method: 'POST' }, true, 204);
  }
  async availability(
    roomId: string,
    dates: { check_in: string; check_out: string },
    signal?: AbortSignal,
  ) {
    if (!/^[1-9]\d*$/.test(roomId) || !id(Number(roomId))) throw new CustomerError(404);
    const body = await this.request(`/rooms/${roomId}/availability?${new URLSearchParams(dates)}`, {
      signal,
    });
    if (!isCustomerAvailability(body?.data, Number(roomId), dates)) throw new CustomerError(502);
    return body.data;
  }
  async reserve(data: ReservationDraft & { request_id: string }) {
    const body = await this.request(
      '/bookings',
      { method: 'POST', body: JSON.stringify(data) },
      true,
      [200, 201],
    );
    if (
      !isCustomerBooking(body?.data) ||
      body.data.room_type_id !== data.room_type_id ||
      body.data.check_in !== data.check_in ||
      body.data.check_out !== data.check_out ||
      body.data.rooms !== data.rooms ||
      body.data.guests !== data.guests ||
      body.data.guest_name !== data.guest_name ||
      body.data.nightly_rate !== data.expected_rate
    )
      throw new CustomerError(502);
    const nights =
      (Date.parse(data.check_out + 'T00:00:00Z') - Date.parse(data.check_in + 'T00:00:00Z')) /
      86400000;
    if (
      body.data.total !== quotedTotal(data.expected_rate, data.rooms, nights) ||
      body.data.advance !== '0.00'
    )
      throw new CustomerError(502);
    return body.data;
  }
  async bookings(params: URLSearchParams, signal?: AbortSignal): Promise<CustomerBookingPage> {
    const next = new URLSearchParams();
    for (const key of ['status', 'page', 'per_page'])
      if (params.get(key)) next.set(key, params.get(key)!);
    const body = await this.request(`/bookings?${next}`, { signal });
    if (
      !body ||
      !Array.isArray(body.data) ||
      !body.data.every(isCustomerBooking) ||
      !body.meta ||
      !id(body.meta.current_page) ||
      !id(body.meta.last_page) ||
      !Number.isSafeInteger(body.meta.total) ||
      body.meta.total < 0
    )
      throw new CustomerError(502);
    return body;
  }
  async booking(bookingId: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(bookingId) || !id(Number(bookingId))) throw new CustomerError(404);
    const body = await this.request(`/bookings/${bookingId}`, { signal });
    if (!isCustomerBooking(body?.data) || body.data.id !== Number(bookingId))
      throw new CustomerError(502);
    return body.data;
  }
}
export const CUSTOMER_TOKEN_KEY = 'sda.customer.token';
export function storedCustomerToken() {
  try {
    return sessionStorage.getItem(CUSTOMER_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}
export function saveCustomerToken(value: string) {
  try {
    if (value) sessionStorage.setItem(CUSTOMER_TOKEN_KEY, value);
    else sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
  } catch {
    /* Current-tab memory still works when browser storage is unavailable. */
  }
}
