import { expect, it } from 'vitest';
import { isAgentReport, agentReportFilters } from '../../src/staff/agent-reports';
import { agentReport } from '../agent-report-fixtures';
it('validates source availability and rejects inconsistent status totals or unauthorized metrics', () => {
  expect(isAgentReport(agentReport)).toBe(true);
  expect(
    isAgentReport({
      ...agentReport,
      data: [{ ...agentReport.data[0], leads: { ...agentReport.data[0].leads, total: 99 } }],
    }),
  ).toBe(false);
  expect(
    isAgentReport({ ...agentReport, meta: { ...agentReport.meta, available_sections: ['leads'] } }),
  ).toBe(false);
  expect(
    isAgentReport({
      ...agentReport,
      data: [
        {
          ...agentReport.data[0],
          site_visits: { ...agentReport.data[0].site_visits, upcoming: 3 },
        },
      ],
    }),
  ).toBe(false);
});
it('keeps valid calendar filters and rejects invalid dates ordering timezones and agent IDs', () => {
  expect(
    agentReportFilters({
      from: '2026-03-08',
      to: '2026-03-08',
      timezone: 'America/New_York',
      user_id: '7',
    }).get('timezone'),
  ).toBe('America/New_York');
  for (const filters of [
    { from: '2026-02-30' },
    { from: '2026-06-11', to: '2026-06-10' },
    { user_id: '1.5' },
    { timezone: 'Invalid/Zone' },
  ])
    expect(() => agentReportFilters(filters)).toThrow();
});
