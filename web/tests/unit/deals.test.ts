import { expect, it } from 'vitest';
import { deal } from '../deal-fixtures';
import {
  money,
  reservationPayload,
  ReservationRequest,
  isDeal,
  isDealSummary,
  dealWriteAllowed,
} from '../../src/staff/deals';
const values = {
  property_id: 7,
  lead_id: 12,
  agreed_price: '9999999999999.99',
  booking_amount: '9999999999999.98',
  payment_reference: ' A ',
  notes: ' Terms ',
};
it('normalizes and compares maximum money without floating point loss', () => {
  expect(reservationPayload(values)).toMatchObject({
    agreed_price: values.agreed_price,
    booking_amount: values.booking_amount,
    payment_reference: 'A',
    notes: 'Terms',
  });
  expect(money('0001.1')).toBe('1.10');
  expect(reservationPayload({ ...values, booking_amount: '' }).booking_amount).toBe('0.00');
  expect(() =>
    reservationPayload({ ...values, agreed_price: '1.00', booking_amount: '1.01' }),
  ).toThrow('advance');
  expect(() => reservationPayload({ ...values, agreed_price: '0' })).toThrow('positive');
});
it.each(['-1', '1e3', '1.001', '10000000000000', ' 1', '1.', 'Infinity'])(
  'rejects invalid decimal %s',
  (v) => expect(() => money(v)).toThrow(),
);
it('retains the UUID and immutable payload for uncertain writes', () => {
  const request = new ReservationRequest(),
    payload = reservationPayload(values),
    first = request.prepare(payload);
  expect(request.prepare(payload)).toEqual(first);
  expect(() => request.prepare({ ...payload, notes: 'changed' })).toThrow('pending');
  request.resolved();
  expect(request.prepare({ ...payload, notes: 'changed' }).request_id).not.toBe(first.request_id);
});
it('validates private detail and nullable source history while rejecting malformed money and events', () => {
  expect(isDeal(deal)).toBe(true);
  expect(isDeal({ ...deal, property_id: null, lead_id: null, person_id: null })).toBe(true);
  expect(isDealSummary({ ...deal, agreed_price: 123 })).toBe(false);
  expect(isDealSummary({ ...deal, booking_amount: '9999999999999.999' })).toBe(false);
  expect(isDeal({ ...deal, events: [{ ...deal.events[0], changes: [] }] })).toBe(false);
  expect(isDeal({ ...deal, events: undefined })).toBe(false);
});
it('requires source rights for writes and allows cancellation without lead rights', () => {
  const profile = {
    id: 1,
    name: 'Staff',
    email: 'a@example.test',
    role: {
      name: 'Custom',
      permission_type: 'custom',
      permissions: ['deals.view', 'deals.cancel', 'properties', 'properties.edit'],
    },
  };
  expect(dealWriteAllowed(profile, 'cancel')).toBe(true);
  expect(dealWriteAllowed(profile, 'confirm')).toBe(false);
  expect(
    dealWriteAllowed(
      { ...profile, role: { ...profile.role, permissions: ['deals.view', 'deals.cancel'] } },
      'cancel',
    ),
  ).toBe(false);
});
