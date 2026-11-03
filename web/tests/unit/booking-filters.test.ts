import { expect, it } from 'vitest';
import { bookingFilters } from '../../src/staff/stays';
it('builds combined URL filters, drops empty fields and resets pagination', () => {
  const p = bookingFilters({
    booking_id: '51',
    stay_id: '1',
    arrival_from: '2030-01-02',
    arrival_to: '2030-01-02',
    status: 'confirmed',
    attendance_status: 'not_arrived',
    room_type_id: '',
    page: '7',
  });
  expect(p.get('booking_id')).toBe('51');
  expect(p.get('stay_id')).toBe('1');
  expect(p.get('arrival_to')).toBe('2030-01-02');
  expect(p.has('page')).toBe(false);
  expect(p.has('room_type_id')).toBe(false);
  expect(bookingFilters({ arrival_to: '2024-02-29' }).toString()).toBe('arrival_to=2024-02-29');
});
it('rejects invalid dates, reversed ranges and unsafe identifiers', () => {
  for (const values of [
    { arrival_from: '2030-02-29' },
    { arrival_from: '2030-01-03', arrival_to: '2030-01-02' },
    { booking_id: '0' },
    { stay_id: '9007199254740992' },
    { room_type_id: '1.5' },
  ])
    expect(() => bookingFilters(values)).toThrow();
});
