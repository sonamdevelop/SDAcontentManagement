import type { CustomerAvailability } from '../src/customer/reservation';
import { customer, customerBooking } from './customer-fixtures';
export const reservationQuote: CustomerAvailability = {
  room_type_id: 2,
  stay_name: 'River stay',
  room_name: 'Deluxe',
  timezone: 'Asia/Kolkata',
  check_in: '2030-01-01',
  check_out: '2030-01-03',
  nights: 2,
  capacity: 2,
  nightly_rate: '1000.25',
  currency: 'INR',
  available_rooms: 2,
};
export const reservedBooking = {
  ...customerBooking,
  room_type_id: 2,
  guest_name: customer.name,
  advance: '0.00',
  received_total: '0.00',
  refunded_total: '0.00',
  net_paid: '0.00',
  balance: '4001.00',
};
