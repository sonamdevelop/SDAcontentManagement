import type { Customer, CustomerBooking } from '../src/customer/api';
import { finance } from './payment-fixtures';
export const customer: Customer = {
  id: 7,
  name: 'Asha Customer',
  email: 'asha@example.test',
  phone: null,
};
export const customerBooking: CustomerBooking = {
  ...finance,
  id: 51,
  stay_name: 'Historic forest stay',
  room_name: 'Deluxe',
  guest_name: 'Asha guest',
  timezone: 'Asia/Kolkata',
  check_in: '2030-01-01',
  check_out: '2030-01-03',
  rooms: 2,
  guests: 4,
  nightly_rate: '1000.25',
  attendance_status: 'not_arrived',
  checked_in_at: null,
  checked_out_at: null,
};
export const customerPage = {
  data: [customerBooking],
  meta: { current_page: 1, last_page: 1, total: 1 },
};
