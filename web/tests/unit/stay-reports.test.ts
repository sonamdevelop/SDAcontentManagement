import { expect, it } from 'vitest';
import { isStayReport, reportDates, netCash } from '../../src/staff/stay-reports';
import { stayReport } from '../stay-report-fixtures';
it('validates contiguous days, scope/context, totals and exact signed money', () => {
  const valid = (r: unknown) => isStayReport(r, 1, '2030-01-02', '2030-01-04');
  expect(valid(stayReport)).toBe(true);
  expect(valid({ ...stayReport, summary: { ...stayReport.summary, booked_room_nights: 6 } })).toBe(
    false,
  );
  expect(valid({ ...stayReport, days: [...stayReport.days].reverse() })).toBe(false);
  expect(
    valid({ ...stayReport, cash_movement: [{ currency: 'INR', receipts: 0.1, refunds: '0.00' }] }),
  ).toBe(false);
  expect(valid({ ...stayReport, context: { ...stayReport.context, stay_id: 2 } })).toBe(false);
  expect(
    valid({
      ...stayReport,
      booked_value: [stayReport.booked_value[0], stayReport.booked_value[0]],
    }),
  ).toBe(false);
  expect(netCash('-99999999999999999.99', '0.01')).toBe('-100000000000000000.00');
  expect(netCash('0.01', '-0.01')).toBe('0.02');
});
it('uses strict civil dates and rejects unbounded or backwards report windows', () => {
  expect(reportDates('2026-03-08', '2026-03-09')).toBe(1);
  for (const [from, to] of [
    ['2030-02-30', '2030-03-04'],
    ['2030-01-01', '2030-01-01'],
    ['2030-01-01', '2030-04-01'],
  ])
    expect(() => reportDates(from, to)).toThrow();
});
