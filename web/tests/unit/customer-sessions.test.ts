import { expect, it } from 'vitest';
import { isCustomerSession, isCustomerSessionPage } from '../../src/customer/sessions';
import { sessionPage } from '../customer-session-fixtures';
it('validates device metadata and chronology without trusting malformed IDs or current flags', () => {
  expect(isCustomerSessionPage(sessionPage, 1)).toBe(true);
  expect(isCustomerSession({ ...sessionPage.data[0], device_name: '📱'.repeat(100) })).toBe(true);
  expect(isCustomerSession({ ...sessionPage.data[0], device_name: '📱'.repeat(101) })).toBe(false);
  expect(isCustomerSession({ ...sessionPage.data[0], expires_at: null })).toBe(true);
  expect(isCustomerSession({ ...sessionPage.data[0], id: '7' })).toBe(false);
  expect(isCustomerSession({ ...sessionPage.data[0], last_used_at: '2020-01-01' })).toBe(false);
  expect(
    isCustomerSessionPage({ ...sessionPage, data: [sessionPage.data[0], sessionPage.data[0]] }, 1),
  ).toBe(false);
  expect(
    isCustomerSessionPage(
      { ...sessionPage, data: sessionPage.data.map((r) => ({ ...r, is_current: false })) },
      1,
    ),
  ).toBe(false);
  expect(isCustomerSessionPage(sessionPage, 2)).toBe(false);
});
