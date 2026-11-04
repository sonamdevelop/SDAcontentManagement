import { operationDate } from './operations';
import { StaffApi, StaffError, type Page } from './api';
export type LeadMetrics = {
  total: number;
  open: number;
  won: number;
  lost: number;
  unclassified: number;
};
export type VisitMetrics = {
  total: number;
  scheduled: number;
  completed: number;
  cancelled: number;
  no_show: number;
  upcoming: number;
};
export type AgentMetrics = {
  user_id: number;
  name: string;
  active: boolean;
  leads: LeadMetrics | null;
  site_visits: VisitMetrics | null;
};
export type AgentReport = Page<AgentMetrics> & {
  meta: Page<AgentMetrics>['meta'] & {
    period: { from: string | null; to: string | null; timezone: string };
    user_id: number | null;
    as_of: string;
    available_sections: ('leads' | 'site_visits')[];
  };
};
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0,
  id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
function validDate(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== 'string' || value < '1000-01-01' || value > '9998-12-31') return false;
  try {
    operationDate(value);
    return true;
  } catch {
    return false;
  }
}
export function agentReportFilters(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const key of ['from', 'to'])
    if (values[key]) {
      if (!validDate(values[key]))
        throw new Error('Choose valid report dates from 1000 through 9998.');
      params.set(key, values[key]!);
    }
  if (values.from && values.to && values.to < values.from)
    throw new Error('Report to must be on or after report from.');
  if (values.user_id) {
    if (!/^[1-9]\d*$/.test(values.user_id) || !id(Number(values.user_id)))
      throw new Error('Use a positive agent ID.');
    params.set('user_id', values.user_id);
  }
  if (values.timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: values.timezone });
    } catch {
      throw new Error('Choose a valid calendar timezone.');
    }
    params.set('timezone', values.timezone);
  }
  return params;
}
export function isAgentReport(v: unknown): v is AgentReport {
  if (!v || typeof v !== 'object') return false;
  const page = v as AgentReport,
    meta = page.meta;
  if (
    !meta ||
    !id(meta.current_page) ||
    !id(meta.last_page) ||
    !count(meta.total) ||
    !meta.period ||
    !validDate(meta.period.from) ||
    !validDate(meta.period.to) ||
    (meta.period.from && meta.period.to && meta.period.to < meta.period.from) ||
    typeof meta.period.timezone !== 'string' ||
    !meta.period.timezone ||
    (meta.user_id !== null && !id(meta.user_id)) ||
    typeof meta.as_of !== 'string' ||
    !Number.isFinite(Date.parse(meta.as_of)) ||
    !Array.isArray(meta.available_sections) ||
    !meta.available_sections.length ||
    new Set(meta.available_sections).size !== meta.available_sections.length ||
    !meta.available_sections.every((s) => ['leads', 'site_visits'].includes(s)) ||
    !Array.isArray(page.data)
  )
    return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: meta.period.timezone });
  } catch {
    return false;
  }
  return (
    page.data.every((row) => {
      if (
        !id(row.user_id) ||
        typeof row.name !== 'string' ||
        typeof row.active !== 'boolean' ||
        (meta.user_id !== null && row.user_id !== meta.user_id)
      )
        return false;
      for (const source of ['leads', 'site_visits'] as const) {
        const metrics = row[source];
        if (!meta.available_sections.includes(source)) {
          if (metrics !== null) return false;
          continue;
        }
        if (!metrics || !Object.values(metrics).every(count)) return false;
        if (source === 'leads') {
          const m = metrics as LeadMetrics;
          if (
            ![m.total, m.open, m.won, m.lost, m.unclassified].every(count) ||
            m.total !== m.open + m.won + m.lost + m.unclassified
          )
            return false;
        } else {
          const m = metrics as VisitMetrics;
          if (
            ![m.total, m.scheduled, m.completed, m.cancelled, m.no_show, m.upcoming].every(count) ||
            m.total !== m.scheduled + m.completed + m.cancelled + m.no_show ||
            m.upcoming > m.scheduled
          )
            return false;
        }
      }
      return true;
    }) && new Set(page.data.map((row) => row.user_id)).size === page.data.length
  );
}
export class AgentReportApi {
  constructor(private api: StaffApi) {}
  async list(params: URLSearchParams, signal?: AbortSignal) {
    const body = await this.api.request<unknown>('/admin/reports/agents?' + params, { signal });
    if (
      !isAgentReport(body) ||
      body.meta.period.from !== (params.get('from') || null) ||
      body.meta.period.to !== (params.get('to') || null) ||
      body.meta.user_id !== (params.get('user_id') ? Number(params.get('user_id')) : null) ||
      (params.get('timezone') && body.meta.period.timezone !== params.get('timezone'))
    )
      throw new StaffError(502);
    return body;
  }
}
