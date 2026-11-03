import { StaffApi, StaffError } from './api';
import { isBooking, type Booking } from './stays';
import {
  isFinancialSummary,
  isPaymentEntry,
  type FinancialSummary,
  type PaymentEntry,
} from './payments';
export type StatementEntry = Omit<
  PaymentEntry,
  'booking_id' | 'currency' | 'reference' | 'reason' | 'actor_id'
> & { effective: boolean };
export type StayStatement = {
  generated_at: string;
  booking: Pick<
    Booking,
    | 'id'
    | 'room_type_id'
    | 'stay_name'
    | 'room_name'
    | 'timezone'
    | 'check_in'
    | 'check_out'
    | 'rooms'
    | 'guests'
    | 'nightly_rate'
  > & { guest_name: string };
  summary: FinancialSummary;
  entries: StatementEntry[];
};
const cents = (v: string) => BigInt(v.replace('.', ''));
export function isStayStatement(value: unknown, bookingId: number): value is StayStatement {
  if (!value || typeof value !== 'object') return false;
  const v = value as StayStatement;
  try {
    if (
      typeof v.generated_at !== 'string' ||
      !Number.isFinite(Date.parse(v.generated_at)) ||
      !v.booking ||
      v.booking.id !== bookingId ||
      typeof v.booking.guest_name !== 'string' ||
      !isFinancialSummary(v.summary) ||
      !isBooking({ ...v.booking, ...v.summary }) ||
      !Array.isArray(v.entries)
    )
      return false;
    const byId = new Map<number, StatementEntry>();
    let previous = 0;
    for (const r of v.entries) {
      if (
        !isPaymentEntry(
          {
            ...r,
            booking_id: bookingId,
            currency: v.summary.currency,
            reference: null,
            reason: null,
            actor_id: null,
          },
          bookingId,
        ) ||
        typeof r.effective !== 'boolean' ||
        r.id <= previous
      )
        return false;
      byId.set(r.id, r);
      previous = r.id;
    }
    let received = 0n,
      refunded = 0n;
    for (const r of v.entries) {
      if (r.kind === 'reversal') {
        const target = byId.get(r.reversal_of!);
        if (
          !target ||
          target.id >= r.id ||
          target.kind === 'reversal' ||
          target.reversed_by !== r.id ||
          target.amount !== r.amount ||
          target.method !== r.method ||
          r.reversed_by !== null
        )
          return false;
      }
      if (r.reversed_by !== null) {
        const reverse = byId.get(r.reversed_by);
        if (!reverse || reverse.kind !== 'reversal' || reverse.reversal_of !== r.id) return false;
      }
      if (r.effective !== (r.kind !== 'reversal' && r.reversed_by === null)) return false;
      if (r.effective) {
        if (r.kind === 'refund') refunded += cents(r.amount);
        else received += cents(r.amount);
      }
    }
    return (
      received === cents(v.summary.received_total) && refunded === cents(v.summary.refunded_total)
    );
  } catch {
    return false;
  }
}
export class StatementApi {
  constructor(private api: StaffApi) {}
  async get(id: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new StaffError(404);
    const result = await this.api.request<{ data: StayStatement }>(
      `/admin/stay-bookings/${id}/statement`,
      { signal },
    );
    if (!isStayStatement(result?.data, Number(id))) throw new StaffError(502);
    return result.data;
  }
}
