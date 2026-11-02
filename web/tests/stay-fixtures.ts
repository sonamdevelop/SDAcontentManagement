import type { Stay, Booking } from '../src/staff/stays';
export const stay: Stay = {
  id: 1,
  name: 'River stay',
  city: 'Dandeli',
  timezone: 'Asia/Kolkata',
  active: true,
  rooms: [
    {
      id: 2,
      stay_id: 1,
      name: 'Deluxe',
      inventory: 2,
      capacity: 2,
      nightly_rate: '1000.25',
      active: true,
    },
  ],
};
export const booking: Booking = {
  id: 51,
  room_type_id: 2,
  stay_name: 'River stay',
  room_name: 'Deluxe',
  timezone: 'Asia/Kolkata',
  check_in: '2030-01-01',
  check_out: '2030-01-03',
  rooms: 2,
  guests: 4,
  currency: 'INR',
  nightly_rate: '1000.25',
  total: '4001.00',
  advance: '100.01',
  balance: '3900.99',
  status: 'confirmed',
  guest_name: 'Guest',
  guest_email: 'guest@example.test',
  guest_phone: null,
  payment_reference: 'Receipt',
  notes: null,
  cancellation_reason: null,
  events: [
    {
      id: 1,
      actor_id: 1,
      action: 'created',
      changes: { total: '4001.00', advance: '100.01' },
      created_at: '2026-11-02T10:00:00Z',
    },
  ],
};
export const stayMeta = { current_page: 1, last_page: 1, total: 1 };
