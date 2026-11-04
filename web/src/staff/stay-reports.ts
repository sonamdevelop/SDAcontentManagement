import { StaffApi, StaffError } from './api';
import { operationDate } from './operations';
export const STAY_REPORT_PERMISSIONS = [
  'stays',
  'stay-bookings',
  'stay-bookings.view',
  'stay-bookings.payments',
];
export type StayReport = {
  context: {
    stay_id: number;
    stay_name: string;
    timezone: string;
    from: string;
    to: string;
    as_of: string;
    inventory_basis: 'current_all_room_types';
    booking_scope: 'authorized_records';
  };
  summary: {
    booked_room_nights: number;
    inventory_room_nights: number;
    confirmed_bookings: number;
  };
  days: { date: string; booked_rooms: number; inventory_rooms: number; over_capacity: boolean }[];
  booked_value: { currency: string; amount: string }[];
  cash_movement: { currency: string; receipts: string; refunds: string }[];
};
const count = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const money = (v: unknown) => typeof v === 'string' && /^-?(?:0|[1-9]\d{0,30})\.\d{2}$/.test(v);
export function reportDates(from: string, to: string) {
  operationDate(from);
  operationDate(to);
  const nights = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000;
  if (from < '1000-01-01' || to >= '9999-01-01' || nights < 1 || nights > 62)
    throw new Error('Choose a report range of 1–62 nights; the end date is exclusive.');
  return nights;
}
export function isStayReport(
  value: unknown,
  stay: number,
  from: string,
  to: string,
): value is StayReport {
  try {
    const r = value as StayReport,
      c = r.context,
      nights = reportDates(from, to);
    if (
      !c ||
      c.stay_id !== stay ||
      c.from !== from ||
      c.to !== to ||
      typeof c.stay_name !== 'string' ||
      c.inventory_basis !== 'current_all_room_types' ||
      c.booking_scope !== 'authorized_records' ||
      typeof c.as_of !== 'string' ||
      !Number.isFinite(Date.parse(c.as_of))
    )
      return false;
    new Intl.DateTimeFormat('en', { timeZone: c.timezone });
    if (
      typeof c.timezone !== 'string' ||
      !r.summary ||
      !Object.values(r.summary).every(count) ||
      !count(r.summary.confirmed_bookings) ||
      !Array.isArray(r.days) ||
      r.days.length !== nights
    )
      return false;
    if (
      !r.days.every(
        (d, i) =>
          d.date ===
            new Date(Date.parse(from + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10) &&
          count(d.booked_rooms) &&
          count(d.inventory_rooms) &&
          d.inventory_rooms === r.days[0].inventory_rooms &&
          d.over_capacity === d.booked_rooms > d.inventory_rooms,
      )
    )
      return false;
    if (
      r.summary.booked_room_nights !== r.days.reduce((n, d) => n + d.booked_rooms, 0) ||
      r.summary.inventory_room_nights !== r.days.reduce((n, d) => n + d.inventory_rooms, 0)
    )
      return false;
    const currencies = (rows: { currency: string }[]) =>
      Array.isArray(rows) &&
      rows.every((r) => typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency)) &&
      new Set(rows.map((r) => r.currency)).size === rows.length;
    return (
      currencies(r.booked_value) &&
      r.booked_value.every((r) => money(r.amount) && !r.amount.startsWith('-')) &&
      currencies(r.cash_movement) &&
      r.cash_movement.every((r) => money(r.receipts) && money(r.refunds))
    );
  } catch {
    return false;
  }
}
export class StayReportApi {
  constructor(private api: StaffApi) {}
  async get(stay: string, from: string, to: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(stay) || !Number.isSafeInteger(Number(stay))) throw new StaffError(404);
    reportDates(from, to);
    const r = await this.api.request<StayReport>(
      `/admin/stays/${stay}/report?${new URLSearchParams({ from, to })}`,
      { signal },
    );
    if (!isStayReport(r, Number(stay), from, to)) throw new StaffError(502);
    return r;
  }
}
export function netCash(receipts: string, refunds: string) {
  const amount = BigInt(receipts.replace('.', '')) - BigInt(refunds.replace('.', ''));
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
