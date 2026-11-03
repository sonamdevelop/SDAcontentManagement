import { expect, it } from 'vitest';
import { isPaymentFollowUp } from '../../src/staff/payment-followups';
import { followUps, refundRow } from '../payment-followup-fixtures';
it('validates exact collection/refund arithmetic without losing a cent at the maximum amount', () => {
  expect(isPaymentFollowUp(followUps.data[0], 'collection')).toBe(true);
  expect(isPaymentFollowUp(refundRow, 'refund')).toBe(true);
  expect(
    isPaymentFollowUp(
      { ...followUps.data[0], net_paid: '9999999999999.98', amount_due: '9999999999999.99' },
      'collection',
    ),
  ).toBe(true);
  expect(isPaymentFollowUp({ ...followUps.data[0], balance: '0.02' }, 'collection')).toBe(false);
  expect(isPaymentFollowUp(refundRow, 'collection')).toBe(false);
  expect(isPaymentFollowUp({ ...refundRow, amount_due: '10.00' }, 'refund')).toBe(false);
  expect(isPaymentFollowUp({ ...refundRow, check_out: '2030-02-30' }, 'refund')).toBe(false);
});
