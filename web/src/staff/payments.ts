import { StaffApi, StaffError, type Page } from './api';
import { isBooking } from './stays';
export const PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'other'] as const;
export type FinancialSummary = {
  total: string;
  advance: string;
  currency: string;
  status: 'confirmed' | 'cancelled';
  received_total: string;
  refunded_total: string;
  net_paid: string;
  amount_due: string;
  balance: string;
  refund_due: string;
};
export type PaymentEntry = {
  id: number;
  booking_id: number;
  kind: 'opening_advance' | 'payment' | 'refund' | 'reversal';
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  reason: string | null;
  reversal_of: number | null;
  reversed_by: number | null;
  actor_id: number | null;
  created_at: string;
};
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const nullableId = (v: unknown) => v === null || id(v);
const amount = (v: unknown) => typeof v === 'string' && /^\d{1,13}\.\d{2}$/.test(v);
export function isFinancialSummary(value: unknown): value is FinancialSummary {
  if (!value || typeof value !== 'object') return false;
  const v = value as FinancialSummary;
  return (
    [
      'total',
      'advance',
      'received_total',
      'refunded_total',
      'net_paid',
      'amount_due',
      'balance',
      'refund_due',
    ].every((k) => amount((v as unknown as Record<string, unknown>)[k])) &&
    isBooking({
      ...v,
      id: 1,
      room_type_id: 1,
      stay_name: '',
      room_name: '',
      timezone: 'UTC',
      check_in: '2030-01-01',
      check_out: '2030-01-02',
      rooms: 1,
      guests: 1,
      nightly_rate: '1.00',
    })
  );
}
export function isPaymentEntry(value: unknown, bookingId: number): value is PaymentEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as PaymentEntry;
  return (
    id(v.id) &&
    v.booking_id === bookingId &&
    ['opening_advance', 'payment', 'refund', 'reversal'].includes(v.kind) &&
    amount(v.amount) &&
    BigInt(v.amount.replace('.', '')) > 0n &&
    typeof v.currency === 'string' &&
    /^[A-Z]{3}$/.test(v.currency) &&
    ([...PAYMENT_METHODS, 'unspecified'] as string[]).includes(v.method) &&
    [v.reference, v.reason].every((s) => s === null || typeof s === 'string') &&
    [v.reversal_of, v.reversed_by, v.actor_id].every(nullableId) &&
    typeof v.created_at === 'string' &&
    Number.isFinite(Date.parse(v.created_at)) &&
    (v.kind === 'reversal' ? id(v.reversal_of) : v.reversal_of === null)
  );
}
export type LedgerPage = Page<PaymentEntry> & { summary: FinancialSummary };
export class PaymentApi {
  constructor(private api: StaffApi) {}
  private path(id: number) {
    if (!Number.isSafeInteger(id) || id < 1) throw new StaffError(404);
    return `/admin/stay-bookings/${id}`;
  }
  async list(id: number, page = 1, signal?: AbortSignal) {
    const result = await this.api.request<LedgerPage>(`${this.path(id)}/payments?page=${page}`, {
      signal,
    });
    if (
      !result ||
      !Array.isArray(result.data) ||
      !result.data.every((v) => isPaymentEntry(v, id)) ||
      !isFinancialSummary(result.summary) ||
      !result.meta ||
      ![result.meta.current_page, result.meta.last_page].every(
        (v) => Number.isSafeInteger(v) && v > 0,
      ) ||
      !Number.isSafeInteger(result.meta.total) ||
      result.meta.total < 0
    )
      throw new StaffError(502);
    return result;
  }
  async record(
    id: number,
    action: 'payment' | 'refund' | 'reversal',
    payload: Record<string, unknown>,
    entryId?: number,
  ) {
    if (action === 'reversal' && (!entryId || !Number.isSafeInteger(entryId)))
      throw new StaffError(404);
    const suffix =
      action === 'reversal'
        ? `payments/${entryId}/reverse`
        : action === 'payment'
          ? 'payments'
          : 'refunds';
    const result = await this.api.request<{ data: PaymentEntry; summary: FinancialSummary }>(
      `${this.path(id)}/${suffix}`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    if (!result || !isPaymentEntry(result.data, id) || !isFinancialSummary(result.summary))
      throw new StaffError(502);
    return result;
  }
}
