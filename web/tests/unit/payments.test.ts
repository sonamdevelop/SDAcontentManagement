import { expect, it } from 'vitest';
import { isFinancialSummary, isPaymentEntry } from '../../src/staff/payments';
import { isBooking } from '../../src/staff/stays';
import { finance, financialBooking, opening } from '../payment-fixtures';
it('validates exact net receipts and outstanding/refund balances', () => {
  expect(isFinancialSummary(finance)).toBe(true);
  expect(isBooking(financialBooking)).toBe(true);
  expect(isFinancialSummary({ ...finance, balance: '3901.00' })).toBe(false);
  expect(isFinancialSummary({ ...finance, received_total: 100.01 })).toBe(false);
  expect(
    isFinancialSummary({
      ...finance,
      status: 'cancelled',
      amount_due: '0.00',
      balance: '0.00',
      refund_due: '100.01',
    }),
  ).toBe(true);
  expect(isFinancialSummary({ ...finance, refunded_total: '100.02' })).toBe(false);
});
it('accepts refunded/repaid totals and corrected opening advances without treating old advance as current payment', () => {
  expect(
    isBooking({
      ...financialBooking,
      received_total: '500.50',
      refunded_total: '25.25',
      net_paid: '475.25',
      balance: '3525.75',
    }),
  ).toBe(true);
  expect(
    isBooking({
      ...financialBooking,
      received_total: '0.00',
      net_paid: '0.00',
      balance: '4001.00',
    }),
  ).toBe(true);
});
it('validates ledger history and rejects lossy amounts, wrong parents and malformed reversal links', () => {
  expect(isPaymentEntry(opening, 51)).toBe(true);
  expect(isPaymentEntry({ ...opening, amount: 100.01 }, 51)).toBe(false);
  expect(isPaymentEntry(opening, 52)).toBe(false);
  expect(isPaymentEntry({ ...opening, kind: 'reversal', reversal_of: null }, 51)).toBe(false);
  expect(isPaymentEntry({ ...opening, kind: 'reversal', reversal_of: 1, id: 2 }, 51)).toBe(true);
});
