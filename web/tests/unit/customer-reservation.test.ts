import { expect, it } from 'vitest';
import { isCustomerAvailability, reservationDraft } from '../../src/customer/reservation';
import { PendingBooking } from '../../src/staff/stays';
import { reservationQuote } from '../reservation-fixtures';
it('validates date-aligned exact customer quotes and rejects malformed availability', () => {
  const dates = { check_in: reservationQuote.check_in, check_out: reservationQuote.check_out };
  expect(isCustomerAvailability(reservationQuote, 2, dates)).toBe(true);
  expect(isCustomerAvailability({ ...reservationQuote, nights: 3 }, 2, dates)).toBe(false);
  expect(isCustomerAvailability({ ...reservationQuote, available_rooms: -1 }, 2, dates)).toBe(
    false,
  );
  expect(isCustomerAvailability({ ...reservationQuote, nightly_rate: 1000.25 }, 2, dates)).toBe(
    false,
  );
});
it('freezes a bounded reservation payload and reuses its request ID without accepting changed details', () => {
  const draft = reservationDraft(reservationQuote, {
    rooms: '2',
    guests: '4',
    guest_name: '  Customer guest  ',
    guest_phone: '',
  });
  expect(draft.expected_rate).toBe('1000.25');
  expect(draft.guest_name).toBe('Customer guest');
  expect(draft).not.toHaveProperty('advance');
  const pending = new PendingBooking(),
    one = pending.prepare(draft);
  expect(pending.prepare(draft)).toEqual(one);
  expect(() => pending.prepare({ ...draft, rooms: 1 })).toThrow();
  expect(() =>
    reservationDraft(reservationQuote, { rooms: '3', guests: '4', guest_name: 'Customer' }),
  ).toThrow();
  expect(() =>
    reservationDraft(reservationQuote, { rooms: '1', guests: '3', guest_name: 'Customer' }),
  ).toThrow();
});
