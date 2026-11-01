import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { label } from '../domain/property';
import { can } from './api';
import { dueTimestamp, localDateInput } from './leads';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
import {
  terminalAvailable,
  VisitApi,
  visitWindow,
  VISIT_STATUSES,
  type Choice,
  type Visit,
  type VisitStatus,
} from './visits';
function useVisits() {
  const { api } = useAuth();
  return useMemo(() => new VisitApi(api), [api]);
}
const shownTime = (iso: string) => new Date(iso).toLocaleString();
function Picker({
  kind,
  value,
  onChange,
}: {
  kind: 'properties' | 'leads' | 'agents';
  value: Choice | null;
  onChange: (value: Choice | null) => void;
}) {
  const api = useVisits();
  const [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [draft, setDraft] = useState('');
  const load = useCallback(
    (signal: AbortSignal) => api.choices(kind, page, query, signal),
    [api, kind, page, query],
  );
  const result = useResource(`${kind}:${page}:${query}`, load);
  const title = kind === 'properties' ? 'Property' : kind === 'leads' ? 'Lead' : 'Visit agent';
  return (
    <div className="staff-visit-picker">
      <h3>{title}</h3>
      {kind !== 'agents' && (
        <div className="staff-filters">
          <label>
            Search {kind}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setQuery(draft.trim());
                  setPage(1);
                }
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setQuery(draft.trim());
              setPage(1);
            }}
          >
            Search {kind}
          </button>
        </div>
      )}
      {value && (
        <p>
          Selected {title.toLowerCase()}: {value.name}
        </p>
      )}
      {result.loading ? (
        <p role="status">Loading {kind}…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button type="button" onClick={result.retry}>
            Retry {kind}
          </button>
        </>
      ) : result.data ? (
        <>
          <label>
            {title} choice
            <select
              required
              value={value?.id || ''}
              onChange={(e) =>
                onChange(result.data!.data.find((v) => v.id === Number(e.target.value)) || null)
              }
            >
              <option value="">Choose {title.toLowerCase()}</option>
              {value && !result.data.data.some((v) => v.id === value.id) && (
                <option value={value.id}>{value.name}</option>
              )}
              {result.data.data.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          {!result.data.data.length && <p>No matching {kind}.</p>}
          <Pagination meta={result.data.meta} onPage={setPage} />
        </>
      ) : null}
    </div>
  );
}
function TimeFields({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  return (
    <>
      <div className="staff-form-grid">
        <label>
          Visit start
          <input
            type="datetime-local"
            step="1"
            required
            value={start}
            onChange={(e) => onStart(e.target.value)}
          />
        </label>
        <label>
          Visit end
          <input
            type="datetime-local"
            step="1"
            required
            value={end}
            onChange={(e) => onEnd(e.target.value)}
          />
        </label>
      </div>
      <p>
        Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}. Visits must start in the
        future and last no more than 8 hours.
      </p>
    </>
  );
}
export function VisitList() {
  const { profile } = useAuth();
  const api = useVisits();
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const allowed = can(profile, 'visits');
  const load = useCallback(
    (signal: AbortSignal) =>
      allowed ? api.list(new URLSearchParams(query), signal) : Promise.resolve(null),
    [api, allowed, query],
  );
  const result = useResource(query, load);
  const [filterError, setFilterError] = useState<unknown>();
  if (!allowed) return <p role="alert">You do not have permission to view site visits.</p>;
  return (
    <>
      <div className="staff-title">
        <h1>Site visits</h1>
        {can(profile, 'visits.view') && can(profile, 'visits.create') && (
          <Link className="button primary" to="/staff/site-visits/new">
            Schedule visit
          </Link>
        )}
      </div>
      <p>
        Visits are shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Only records visible
        to your account are listed.
      </p>
      {params.get('lead_id') && (
        <p>
          Filtered to linked lead #{params.get('lead_id')} ·{' '}
          <Link to="/staff/site-visits">Clear lead filter</Link>
        </p>
      )}
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          setFilterError(undefined);
          try {
            const data = new FormData(e.currentTarget),
              next = new URLSearchParams();
            const status = String(data.get('status') || '');
            if (status) next.set('status', status);
            for (const key of ['from', 'to']) {
              const value = String(data.get(key) || '');
              if (value) {
                next.set(key, dueTimestamp(value));
              }
            }
            if (
              next.has('from') &&
              next.has('to') &&
              Date.parse(next.get('to')!) < Date.parse(next.get('from')!)
            )
              throw new Error('The filter end must be after its start.');
            if (params.has('lead_id')) next.set('lead_id', params.get('lead_id')!);
            setParams(next);
          } catch (error) {
            setFilterError(error);
          }
        }}
      >
        <label>
          Visit status
          <select name="status" defaultValue={params.get('status') || ''}>
            <option value="">All statuses</option>
            {VISIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visits from
          <input
            type="datetime-local"
            step="1"
            name="from"
            defaultValue={localDateInput(params.get('from'))}
          />
        </label>
        <label>
          Visits to
          <input
            type="datetime-local"
            step="1"
            name="to"
            defaultValue={localDateInput(params.get('to'))}
          />
        </label>
        <button>Filter visits</button>
      </form>
      {filterError ? <Failure error={filterError} /> : null}
      {result.loading ? (
        <p role="status">Loading visits…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry visits</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((visit) => (
              <article key={visit.id} className="staff-panel">
                <h2>
                  {can(profile, 'visits.view') ? (
                    <Link to={`/staff/site-visits/${visit.id}`}>{visit.property_title}</Link>
                  ) : (
                    visit.property_title
                  )}
                </h2>
                <p>
                  {visit.customer_name} · {visit.property_city} · {label(visit.status)}
                </p>
                <p>
                  {shownTime(visit.starts_at)} — {shownTime(visit.ends_at)}
                </p>
              </article>
            ))}
            {!result.data.data.length && <p>No matching site visits.</p>}
          </div>
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
export function VisitCreate() {
  const { profile } = useAuth();
  const api = useVisits();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Choice | null>(null),
    [lead, setLead] = useState<Choice | null>(null),
    [agent, setAgent] = useState<Choice | null>(null),
    [start, setStart] = useState(''),
    [end, setEnd] = useState(''),
    [notes, setNotes] = useState('');
  const mutation = useMutation();
  const allowed = ['visits.view', 'visits.create', 'properties', 'leads', 'leads.view'].every((p) =>
    can(profile, p),
  );
  if (!allowed)
    return (
      <p role="alert">
        Scheduling needs visit creation/view, property access and lead list/detail permissions.
      </p>
    );
  async function submit(e: FormEvent) {
    e.preventDefault();
    void mutation.run(async () => {
      if (!property || !lead || !agent) throw new Error('Choose a property, lead and visit agent.');
      const saved = await api.save({
        property_id: property.id,
        lead_id: lead.id,
        user_id: agent.id,
        ...visitWindow(start, end),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      if (mutation.isActive()) navigate(`/staff/site-visits/${saved.id}`);
    }, '');
  }
  return (
    <>
      <Link to="/staff/site-visits">← Site visits</Link>
      <h1>Schedule site visit</h1>
      <p>
        Choose an available property and an open lead with a contact. Overlapping visits for the
        property, customer or agent are checked when you save.
      </p>
      <form onSubmit={submit}>
        <fieldset className="staff-visit-fieldset" disabled={mutation.busy}>
          <div className="staff-visit-choices">
            <Picker kind="properties" value={property} onChange={setProperty} />
            <Picker kind="leads" value={lead} onChange={setLead} />
            <Picker kind="agents" value={agent} onChange={setAgent} />
          </div>
          <TimeFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
          <label>
            Visit notes
            <textarea maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {mutation.error ? <Failure error={mutation.error} /> : null}
          <button className="button primary" disabled={mutation.busy}>
            {mutation.busy ? 'Scheduling…' : 'Save visit'}
          </button>
        </fieldset>
      </form>
    </>
  );
}
export function VisitDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const api = useVisits();
  const allowed = can(profile, 'visits.view');
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.detail(id, signal) : Promise.resolve(null)),
    [api, id, allowed],
  );
  const result = useResource(id, load);
  if (!allowed) return <p role="alert">You do not have permission to view this visit.</p>;
  return (
    <>
      <Link to="/staff/site-visits">← Site visits</Link>
      {result.loading ? (
        <p role="status">Loading visit…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry visit</button>
        </>
      ) : result.data ? (
        <VisitContent key={id} initial={result.data} />
      ) : null}
    </>
  );
}
function VisitContent({ initial }: { initial: Visit }) {
  const [visit, setVisit] = useState(initial);
  const { profile } = useAuth();
  return (
    <>
      <h1>{visit.property_title}</h1>
      <section className="staff-panel">
        <h2>Visit details</h2>
        <p>
          {label(visit.status)} · {visit.property_city}
        </p>
        <p>
          {shownTime(visit.starts_at)} — {shownTime(visit.ends_at)} (
          {Intl.DateTimeFormat().resolvedOptions().timeZone})
        </p>
        <p>
          {visit.customer_name}
          {visit.customer_email ? ` · ${visit.customer_email}` : ''}
          {visit.customer_phone ? ` · ${visit.customer_phone}` : ''}
        </p>
        <p>Assigned agent #{visit.user_id ?? 'unassigned'}</p>
        {visit.lead_id && can(profile, 'leads.view') && (
          <Link to={`/staff/leads/${visit.lead_id}`}>Open linked lead</Link>
        )}
        <p className="staff-message">{visit.notes || 'No visit notes'}</p>
        {visit.feedback && <p className="staff-message">Feedback: {visit.feedback}</p>}
        {visit.cancellation_reason && <p>Cancellation: {visit.cancellation_reason}</p>}
        <p>
          Rescheduled {visit.reschedule_count} times
          {visit.reschedule_reason ? ` · ${visit.reschedule_reason}` : ''}
        </p>
      </section>
      <div className="staff-lead-actions">
        {visit.status === 'scheduled' && can(profile, 'visits.edit') && (
          <Reschedule visit={visit} onUpdate={setVisit} />
        )}{' '}
        {visit.status === 'scheduled' && can(profile, 'visits.assign') && (
          <AssignVisit visit={visit} onUpdate={setVisit} />
        )}{' '}
        {can(profile, 'visits.edit') && <VisitOutcome visit={visit} onUpdate={setVisit} />}
      </div>
      <section className="staff-panel">
        <h2>Visit history</h2>
        {visit.events.length ? (
          <ol className="staff-visit-history">
            {visit.events.map((event) => (
              <li key={event.id}>
                <strong>{label(event.action)}</strong>
                <p>
                  {shownTime(event.created_at)} · Staff #{event.actor_id ?? 'unknown'}
                </p>
                <dl>
                  {Object.entries(event.changes).map(([key, value]) => (
                    <div key={key}>
                      <dt>{label(key)}</dt>
                      <dd>
                        {typeof value === 'string' || typeof value === 'number'
                          ? String(value)
                          : value === null
                            ? '—'
                            : JSON.stringify(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <p>No visit history yet.</p>
        )}
      </section>
    </>
  );
}
function Reschedule({ visit, onUpdate }: { visit: Visit; onUpdate: (v: Visit) => void }) {
  const api = useVisits();
  const [start, setStart] = useState(localDateInput(visit.starts_at)),
    [end, setEnd] = useState(localDateInput(visit.ends_at)),
    [reason, setReason] = useState('');
  const mutation = useMutation();
  return (
    <section className="staff-panel">
      <h2>Reschedule visit</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(async () => {
            const result = await api.save(
              { ...visitWindow(start, end), reason: reason.trim() },
              visit.id,
              'schedule',
            );
            if (mutation.isActive()) onUpdate(result);
          }, 'Visit rescheduled.');
        }}
      >
        <fieldset className="staff-visit-fieldset" disabled={mutation.busy}>
          <TimeFields start={start} end={end} onStart={setStart} onEnd={setEnd} />
          <label>
            Rescheduling reason
            <textarea
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button>Save new schedule</button>
        </fieldset>
      </form>
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
    </section>
  );
}
function AssignVisit({ visit, onUpdate }: { visit: Visit; onUpdate: (v: Visit) => void }) {
  const api = useVisits();
  const [agent, setAgent] = useState<Choice | null>(null);
  const mutation = useMutation();
  return (
    <section className="staff-panel">
      <h2>Assign visit agent</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(async () => {
            if (!agent) throw new Error('Choose a visit agent.');
            const saved = await api.save({ user_id: agent.id }, visit.id, 'assignment');
            if (mutation.isActive()) onUpdate(saved);
          }, 'Visit assignment saved.');
        }}
      >
        <fieldset className="staff-visit-fieldset" disabled={mutation.busy}>
          <Picker kind="agents" value={agent} onChange={setAgent} />
          <button disabled={!agent || mutation.busy}>Save visit assignment</button>
        </fieldset>
      </form>
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
    </section>
  );
}
function VisitOutcome({ visit, onUpdate }: { visit: Visit; onUpdate: (v: Visit) => void }) {
  const api = useVisits();
  const [status, setStatus] = useState<VisitStatus>('cancelled'),
    [feedback, setFeedback] = useState(visit.feedback || ''),
    [reason, setReason] = useState('');
  const mutation = useMutation();
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  const scheduled = visit.status === 'scheduled';
  const editableFeedback = ['completed', 'no_show'].includes(visit.status);
  if (!scheduled && !editableFeedback) return null;
  return (
    <section className="staff-panel">
      <h2>{scheduled ? 'Update visit outcome' : 'Edit visit feedback'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(
            async () => {
              const saved = await api.save(
                scheduled
                  ? {
                      status,
                      ...(status === 'cancelled'
                        ? { cancellation_reason: reason.trim() }
                        : { feedback: feedback.trim() }),
                    }
                  : { feedback: feedback.trim() },
                visit.id,
                scheduled ? 'status' : 'feedback',
              );
              if (mutation.isActive()) onUpdate(saved);
            },
            scheduled ? 'Visit outcome saved.' : 'Visit feedback saved.',
          );
        }}
      >
        <fieldset className="staff-visit-fieldset" disabled={mutation.busy}>
          {scheduled && (
            <>
              <label>
                Visit outcome
                <select value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed" disabled={!terminalAvailable(visit, clock)}>
                    Completed
                  </option>
                  <option value="no_show" disabled={!terminalAvailable(visit, clock)}>
                    No show
                  </option>
                </select>
              </label>
              {!terminalAvailable(visit, clock) && (
                <p>Completed/no-show updates become available after the visit starts.</p>
              )}
            </>
          )}
          {scheduled && status === 'cancelled' ? (
            <label>
              Cancellation reason
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          ) : (
            <label>
              Visit feedback
              <textarea
                required={!scheduled || status === 'completed'}
                maxLength={5000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </label>
          )}
          <button>{scheduled ? 'Save outcome' : 'Save feedback'}</button>
        </fieldset>
      </form>
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
    </section>
  );
}
