import { expect, it } from 'vitest';
import { operationDate, isOperationRow } from '../../src/staff/operations';
import { operations } from '../operations-fixtures';
it('rejects invalid operations dates and retains valid leap days', () => {
  expect(operationDate('2028-02-29')).toBe('2028-02-29');
  expect(() => operationDate('2030-02-29')).toThrow();
  expect(() => operationDate('2030-1-2')).toThrow();
});
it('validates operational rows without permitting invalid attendance or lossy counts', () => {
  const row = operations.data[0];
  expect(isOperationRow(row)).toBe(true);
  expect(isOperationRow({ ...row, rooms: 1.5 })).toBe(false);
  expect(isOperationRow({ ...row, checked_out_at: '2030-01-02T10:00:00Z' })).toBe(false);
  expect(
    isOperationRow({
      ...row,
      checked_in_at: '2030-01-02T10:00:00Z',
      attendance_status: 'checked_in',
    }),
  ).toBe(true);
});
