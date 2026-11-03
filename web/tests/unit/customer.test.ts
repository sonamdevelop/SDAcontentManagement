import { afterEach, expect, it } from 'vitest';
import {
  isCustomer,
  isCustomerBooking,
  saveCustomerToken,
  storedCustomerToken,
} from '../../src/customer/api';
import { customer, customerBooking } from '../customer-fixtures';
afterEach(() => sessionStorage.clear());
it('validates customer profiles and exact booking balances independently of staff identities', () => {
  expect(isCustomer(customer)).toBe(true);
  expect(isCustomer({ ...customer, phone: { value: '123' } })).toBe(false);
  expect(isCustomerBooking(customerBooking)).toBe(true);
  expect(isCustomerBooking({ ...customerBooking, balance: '3900.98' })).toBe(false);
  expect(isCustomerBooking({ ...customerBooking, guest_name: null })).toBe(false);
});
it('never reads or clears a saved staff token when managing customer sessions', () => {
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  expect(storedCustomerToken()).toBe('');
  saveCustomerToken('customer-private');
  expect(storedCustomerToken()).toBe('customer-private');
  saveCustomerToken('');
  expect(storedCustomerToken()).toBe('');
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
