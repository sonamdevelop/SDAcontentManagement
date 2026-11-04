import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { label } from '../domain/property';
import { can } from './api';
import { AgentReportApi, agentReportFilters, type AgentMetrics } from './agent-reports';
import { useAuth } from './session';
import { Failure, Pagination } from './StaffUi';
export function AgentReportPage() {
  const { api, profile } = useAuth(),
    client = useMemo(() => new AgentReportApi(api), [api]),
    [params, setParams] = useSearchParams(),
    query = params.toString(),
    allowed = ['property-reports', 'property-reports.agents'].every((p) => can(profile, p));
  const load = useCallback(
      (signal: AbortSignal) =>
        allowed ? client.list(new URLSearchParams(query), signal) : Promise.resolve(null),
      [client, query, allowed],
    ),
    result = useResource(query, load),
    [error, setError] = useState<unknown>(),
    [downloading, setDownloading] = useState(false),
    controller = useRef<AbortController | null>(null),
    mounted = useRef(true),
    urls = useRef(new Map<string, number>());
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      for (const [url, timer] of urls.current) {
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      urls.current.clear();
    };
  }, []);
  useEffect(() => {
    controller.current?.abort();
    setError(undefined);
  }, [query]);
  async function download() {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setDownloading(true);
    setError(undefined);
    try {
      const filters = agentReportFilters(Object.fromEntries(new URLSearchParams(query)));
      if (!filters.has('timezone') && result.data)
        filters.set('timezone', result.data.meta.period.timezone);
      const { blob, filename } = await api.agentReportFile(filters, active.signal);
      if (active.signal.aborted || !mounted.current) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      const timer = window.setTimeout(() => {
        URL.revokeObjectURL(url);
        urls.current.delete(url);
      }, 1000);
      urls.current.set(url, timer);
    } catch (e) {
      if (!active.signal.aborted && mounted.current) setError(e);
    } finally {
      if (controller.current === active) controller.current = null;
      if (mounted.current) setDownloading(false);
    }
  }
  if (!allowed) return <p role="alert">You do not have permission to view agent performance.</p>;
  return (
    <>
      <h1>Agent performance</h1>
      <p>
        Lead metrics use creation dates and current pipeline outcomes. Visit metrics use scheduled
        start dates. Available sections follow your report and source permissions.
      </p>
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setParams(
              agentReportFilters(
                Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>,
              ),
            );
            setError(undefined);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <label>
          Report from
          <input
            name="from"
            type="date"
            min="1000-01-01"
            max="9998-12-31"
            defaultValue={params.get('from') || ''}
          />
        </label>
        <label>
          Report to
          <input
            name="to"
            type="date"
            min="1000-01-01"
            max="9998-12-31"
            defaultValue={params.get('to') || ''}
          />
        </label>
        <label>
          Report timezone
          <input
            name="timezone"
            list="report-timezones"
            placeholder="Use organisation timezone"
            defaultValue={params.get('timezone') || ''}
          />
        </label>
        <datalist id="report-timezones">
          {['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York', 'Asia/Dubai'].map(
            (zone) => (
              <option key={zone} value={zone} />
            ),
          )}
        </datalist>
        <label>
          Report agent ID
          <input name="user_id" inputMode="numeric" defaultValue={params.get('user_id') || ''} />
        </label>
        <button>Apply report filters</button>
      </form>
      {error ? <Failure error={error} /> : null}
      <button onClick={result.retry}>Refresh agent report</button>
      {result.loading ? (
        <p>Loading agent report…</p>
      ) : result.error ? (
        <Failure error={result.error} />
      ) : result.data ? (
        <>
          <p>
            Calendar timezone: {result.data.meta.period.timezone} · Snapshot:{' '}
            {result.data.meta.as_of}
          </p>
          <p>
            From {result.data.meta.period.from || 'all dates'} to{' '}
            {result.data.meta.period.to || 'all dates'}, inclusive.
          </p>
          <button disabled={downloading} onClick={() => void download()}>
            {downloading ? 'Preparing CSV…' : 'Export filtered agents CSV'}
          </button>
          <p>
            CSV exports all filtered agents, up to 5,000, using a fresh snapshot with the same
            source permissions.
          </p>
          <div className="staff-grid">
            {result.data.data.map((row) => (
              <AgentCard key={row.user_id} agent={row} />
            ))}
          </div>
          {!result.data.data.length && <p>No agents have matching visible records.</p>}
          <Pagination
            meta={result.data.meta}
            onPage={(page) => {
              const next = new URLSearchParams(params);
              next.set('page', String(page));
              setParams(next);
            }}
          />
        </>
      ) : null}
    </>
  );
}
function AgentCard({ agent }: { agent: AgentMetrics }) {
  return (
    <article className="staff-panel">
      <h2>
        {agent.name} · Agent #{agent.user_id}
      </h2>
      <p>Account: {agent.active ? 'Active' : 'Inactive'}</p>
      <h3>Leads</h3>
      {agent.leads ? (
        <MetricBreakdown
          metrics={agent.leads}
          kinds={['open', 'won', 'lost', 'unclassified']}
          name={`Lead outcomes for agent ${agent.user_id}`}
        />
      ) : (
        <p>Lead metrics are unavailable for this account.</p>
      )}
      <h3>Site visits</h3>
      {agent.site_visits ? (
        <>
          <MetricBreakdown
            metrics={agent.site_visits}
            kinds={['scheduled', 'completed', 'cancelled', 'no_show']}
            name={`Visit outcomes for agent ${agent.user_id}`}
          />
          <p>Upcoming scheduled visits: {agent.site_visits.upcoming}</p>
        </>
      ) : (
        <p>Visit metrics are unavailable for this account.</p>
      )}
    </article>
  );
}
function MetricBreakdown({
  metrics,
  kinds,
  name,
}: {
  metrics: { total: number } & object;
  kinds: string[];
  name: string;
}) {
  const counts = metrics as Record<string, number>,
    colors = ['#405a84', '#287456', '#ad5946', '#826b48'];
  return (
    <>
      <p>Total: {metrics.total}</p>
      <div
        role="img"
        aria-label={`${name}: ${kinds.map((k) => `${label(k)} ${counts[k]}`).join(', ')}`}
        style={{
          display: 'flex',
          minHeight: 16,
          width: '100%',
          background: '#eceef1',
          overflow: 'hidden',
          borderRadius: 4,
        }}
      >
        {kinds.map((key, i) => (
          <span
            key={key}
            style={{
              width: `${metrics.total ? (counts[key] / metrics.total) * 100 : 0}%`,
              background: colors[i],
            }}
          />
        ))}
      </div>
      <dl>
        {kinds.map((key) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>{counts[key]}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
