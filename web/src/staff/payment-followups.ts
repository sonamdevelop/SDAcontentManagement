import { StaffApi, StaffError, type Page } from './api';
import { operationDate } from './operations';
export const FOLLOW_UP_VIEWS = ['collection', 'refund'] as const;
export type PaymentFollowUpView = (typeof FOLLOW_UP_VIEWS)[number];
export type PaymentFollowUp = {
  id: number;
  room_type_id: number;
  room_name: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  status: 'confirmed' | 'cancelled';
  currency: string;
  net_paid: string;
  amount_due: string;
  balance: string;
  refund_due: string;
};
export type PaymentFollowUps = Page<PaymentFollowUp> & {
  context: {
    stay_id: number;
    stay_name: string;
    view: PaymentFollowUpView;
    as_of: string;
    counts: Record<PaymentFollowUpView, number>;
  };
};
const positive = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
export function isPaymentFollowUp(
  value: unknown,
  view: PaymentFollowUpView,
): value is PaymentFollowUp {
  if (!value || typeof value !== 'object') return false;
  const r = value as PaymentFollowUp;
  try {
    operationDate(r.check_in);
    operationDate(r.check_out);
    if (
      r.check_out <= r.check_in ||
      !positive(r.id) ||
      !positive(r.room_type_id) ||
      typeof r.room_name !== 'string' ||
      typeof r.guest_name !== 'string' ||
      !['confirmed', 'cancelled'].includes(r.status) ||
      !/^[A-Z]{3}$/.test(r.currency)
    )
      return false;
    const amounts = [r.net_paid, r.amount_due, r.balance, r.refund_due];
    if (!amounts.every((v) => typeof v === 'string' && /^\d{1,13}\.\d{2}$/.test(v))) return false;
    const [net, due, balance, refund] = amounts.map((v) => BigInt(v.replace('.', '')));
    return (
      balance === (due > net ? due - net : 0n) &&
      refund === (net > due ? net - due : 0n) &&
      (r.status !== 'cancelled' || due === 0n) &&
      (view === 'collection' ? balance > 0n : refund > 0n)
    );
  } catch {
    return false;
  }
}
export class PaymentFollowUpApi {
  constructor(private api: StaffApi) {}
  async get(stayId: string, params: URLSearchParams, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(stayId) || !positive(Number(stayId))) throw new StaffError(404);
    const view = params.get('view') || 'collection';
    if (!FOLLOW_UP_VIEWS.includes(view as PaymentFollowUpView))
      throw new Error('Choose a valid payment queue.');
    const result = await this.api.request<PaymentFollowUps>(
      `/admin/stays/${stayId}/payment-follow-ups?${params}`,
      { signal },
    );
    const c = result?.context;
    if (
      !c ||
      c.stay_id !== Number(stayId) ||
      c.view !== view ||
      typeof c.stay_name !== 'string' ||
      typeof c.as_of !== 'string' ||
      !Number.isFinite(Date.parse(c.as_of)) ||
      !FOLLOW_UP_VIEWS.every((k) => Number.isSafeInteger(c.counts?.[k]) && c.counts[k] >= 0) ||
      !Array.isArray(result.data) ||
      !result.data.every((r) => isPaymentFollowUp(r, view as PaymentFollowUpView)) ||
      !result.meta ||
      !positive(result.meta.current_page) ||
      !positive(result.meta.last_page) ||
      !Number.isSafeInteger(result.meta.total) ||
      result.meta.total < 0
    )
      throw new StaffError(502);
    return result;
  }
}
