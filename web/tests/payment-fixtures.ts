import type { FinancialSummary, PaymentEntry } from '../src/staff/payments';
import { booking } from './stay-fixtures';
export const finance: FinancialSummary = {
  total: '4001.00',
  advance: '100.01',
  currency: 'INR',
  status: 'confirmed',
  received_total: '100.01',
  refunded_total: '0.00',
  net_paid: '100.01',
  amount_due: '4001.00',
  balance: '3900.99',
  refund_due: '0.00',
};
export const financialBooking = { ...booking, ...finance };
export const opening: PaymentEntry = {
  id: 1,
  booking_id: 51,
  kind: 'opening_advance',
  amount: '100.01',
  currency: 'INR',
  method: 'unspecified',
  reference: 'Original receipt',
  reason: null,
  reversal_of: null,
  reversed_by: null,
  actor_id: 1,
  created_at: '2026-11-02T10:00:00Z',
};
