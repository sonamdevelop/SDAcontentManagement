import type { PaymentFollowUps } from '../src/staff/payment-followups';
export const followUps: PaymentFollowUps = {
  data: [
    {
      id: 51,
      room_type_id: 2,
      room_name: 'Deluxe',
      guest_name: 'Finance guest',
      check_in: '2030-01-02',
      check_out: '2030-01-04',
      status: 'confirmed',
      currency: 'INR',
      net_paid: '200.00',
      amount_due: '200.01',
      balance: '0.01',
      refund_due: '0.00',
    },
  ],
  meta: { current_page: 1, last_page: 1, total: 1 },
  context: {
    stay_id: 1,
    stay_name: 'River stay',
    view: 'collection',
    as_of: '2030-01-02T10:00:00Z',
    counts: { collection: 1, refund: 1 },
  },
};
export const refundRow = {
  ...followUps.data[0],
  status: 'cancelled' as const,
  net_paid: '74.99',
  amount_due: '0.00',
  balance: '0.00',
  refund_due: '74.99',
};
