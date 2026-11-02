import { expect, it } from 'vitest';
import { bookingWindow, quotedTotal, PendingBooking, isBooking } from '../../src/staff/stays';
it('counts date-only stays and rejects rollover, empty, reversed and long dates', () => {
  expect(bookingWindow('2028-02-28', '2028-03-01')).toEqual({
    check_in: '2028-02-28',
    check_out: '2028-03-01',
  });
  for (const [a, b] of [
    ['2027-02-29', '2027-03-01'],
    ['2027-01-01', '2027-01-01'],
    ['2029-01-01', '2027-01-01'],
    ['2027-01-01', '2029-01-01'],
  ])
    expect(() => bookingWindow(a, b)).toThrow();
});
it('calculates multi-night room totals exactly and rejects overflow', () => {
  expect(quotedTotal('1000.25', 2, 3)).toBe('6001.50');
  expect(quotedTotal('9999999999999.99', 1, 1)).toBe('9999999999999.99');
  expect(() => quotedTotal('9999999999999.99', 2, 1)).toThrow();
  expect(() => quotedTotal('100', 0, 2)).toThrow();
});
it('keeps an uncertain booking UUID and payload immutable', () => {
  const p = new PendingBooking(),
    first = p.prepare({ rooms: 2, advance: '10.01' });
  expect(p.prepare({ rooms: 2, advance: '10.01' })).toEqual(first);
  expect(() => p.prepare({ rooms: 3 })).toThrow('pending');
  p.resolved();
  expect(p.prepare({ rooms: 3 }).request_id).not.toBe(first.request_id);
});
it('rejects lossy JSON numeric money in booking responses', () => {
  expect(
    isBooking({
      id: 1,
      room_type_id: 2,
      stay_name: 'S',
      room_name: 'R',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      check_in: '2027-01-01',
      check_out: '2027-01-02',
      rooms: 1,
      guests: 1,
      status: 'confirmed',
      nightly_rate: '1000.00',
      total: 1000,
      advance: '0.00',
      balance: '1000.00',
    }),
  ).toBe(false);
});
