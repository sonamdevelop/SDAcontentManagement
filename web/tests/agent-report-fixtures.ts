import type { AgentReport } from '../src/staff/agent-reports';
export const agentReport: AgentReport = {
  data: [
    {
      user_id: 7,
      name: 'Asha Agent',
      active: true,
      leads: { total: 3, open: 1, won: 1, lost: 1, unclassified: 0 },
      site_visits: { total: 2, scheduled: 1, completed: 1, cancelled: 0, no_show: 0, upcoming: 1 },
    },
  ],
  meta: {
    current_page: 1,
    last_page: 2,
    total: 2,
    period: { from: null, to: null, timezone: 'UTC' },
    user_id: null,
    as_of: '2026-11-04T10:00:00Z',
    available_sections: ['leads', 'site_visits'],
  },
};
export const reportStaff = {
  id: 1,
  name: 'Report staff',
  email: 'report@example.test',
  role: {
    name: 'Reports',
    permission_type: 'custom',
    permissions: ['property-reports', 'property-reports.agents', 'leads', 'visits'],
  },
};
export const reportCsv =
  'agent_id,agent_name,active,period_from,period_to,timezone,as_of,leads_total\r\n7,Asha Agent,yes,,,UTC,2026-11-04T10:00:00Z,3\r\n';
export const csvHeaders = {
  'Content-Type': 'text/csv; charset=UTF-8',
  'Content-Disposition': 'attachment; filename="sda-agent-report-2026-11-04.csv"',
};
