import { expect, it } from 'vitest';
import { isStayStatement } from '../../src/staff/statement';
import { statement } from '../statement-fixtures';
it('accepts a complete exact statement and rejects a truncated ledger or wrong booking', () => {
  expect(isStayStatement(statement, 51)).toBe(true);
  expect(isStayStatement(statement, 52)).toBe(false);
  expect(isStayStatement({ ...statement, entries: [] }, 51)).toBe(false);
  expect(
    isStayStatement({ ...statement, entries: [...statement.entries, ...statement.entries] }, 51),
  ).toBe(false);
  expect(
    isStayStatement({ ...statement, summary: { ...statement.summary, balance: '3900.98' } }, 51),
  ).toBe(false);
});
it('validates both correction links and their effect on totals', () => {
  const refund = {
    ...statement.entries[0],
    id: 2,
    kind: 'refund' as const,
    amount: '25.01',
    reversed_by: 3,
    effective: false,
  };
  const reversal = {
    ...refund,
    id: 3,
    kind: 'reversal' as const,
    reversal_of: 2,
    reversed_by: null,
  };
  const corrected = { ...statement, entries: [...statement.entries, refund, reversal] };
  expect(isStayStatement(corrected, 51)).toBe(true);
  expect(
    isStayStatement(
      { ...corrected, entries: [...statement.entries, { ...refund, effective: true }, reversal] },
      51,
    ),
  ).toBe(false);
  expect(
    isStayStatement(
      { ...corrected, entries: [...statement.entries, refund, { ...reversal, reversal_of: 99 }] },
      51,
    ),
  ).toBe(false);
  expect(
    isStayStatement(
      { ...corrected, entries: [...statement.entries, refund, { ...reversal, amount: '25.02' }] },
      51,
    ),
  ).toBe(false);
});
it('preserves one-paise balances at the maximum amount', () => {
  const s = {
    ...statement,
    summary: {
      ...statement.summary,
      total: '9999999999999.99',
      received_total: '9999999999999.98',
      net_paid: '9999999999999.98',
      amount_due: '9999999999999.99',
      balance: '0.01',
    },
    entries: [{ ...statement.entries[0], amount: '9999999999999.98' }],
  };
  expect(isStayStatement(s, 51)).toBe(true);
});
