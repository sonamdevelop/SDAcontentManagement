import type { StayReport } from '../src/staff/stay-reports';
export const stayReport: StayReport = {
  context: {
    stay_id: 1,
    stay_name: 'River stay',
    timezone: 'Asia/Kolkata',
    from: '2030-01-02',
    to: '2030-01-04',
    as_of: '2026-11-04T10:00:00Z',
    inventory_basis: 'current_all_room_types',
    booking_scope: 'authorized_records',
  },
  summary: { booked_room_nights: 5, inventory_room_nights: 4, confirmed_bookings: 2 },
  days: [
    { date: '2030-01-02', booked_rooms: 2, inventory_rooms: 2, over_capacity: false },
    { date: '2030-01-03', booked_rooms: 3, inventory_rooms: 2, over_capacity: true },
  ],
  booked_value: [
    { currency: 'INR', amount: '400.04' },
    { currency: 'USD', amount: '20.01' },
  ],
  cash_movement: [{ currency: 'INR', receipts: '-50.00', refunds: '10.01' }],
};
export const stayReportStaff = {
  id: 1,
  name: 'Finance staff',
  email: 'finance@example.test',
  role: {
    name: 'Finance',
    permission_type: 'custom',
    permissions: ['stays', 'stay-bookings', 'stay-bookings.view', 'stay-bookings.payments'],
  },
};
export const reportPath = '/staff/stay-reports?stay_id=1&from=2030-01-02&to=2030-01-04';
