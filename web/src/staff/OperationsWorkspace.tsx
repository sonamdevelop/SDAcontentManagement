import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { label } from '../domain/property';
import { can } from './api';
import { useAuth } from './session';
import { Failure, Pagination } from './StaffUi';
import { StayApi, localStayDate } from './stays';
import { OperationsApi, OPERATION_VIEWS, operationDate, type OperationView } from './operations';
const titles: Record<OperationView, string> = {
  arrivals: 'Scheduled arrivals',
  departures: 'Scheduled departures',
  in_house: 'In house now',
  overdue: 'Overdue check-outs now',
};
export function StayOperationsPage() {
  const { api: staff, profile } = useAuth(),
    api = useMemo(() => new OperationsApi(staff), [staff]),
    stays = useMemo(() => new StayApi(staff), [staff]);
  const [params, setParams] = useSearchParams(),
    query = params.toString(),
    stayId = params.get('stay_id') || '';
  const [page, setPage] = useState(1),
    [error, setError] = useState<unknown>(),
    [draft, setDraft] = useState<{ query: string; id: string; name: string } | null>(null);
  const selected = draft?.query === query ? draft.id : stayId,
    selectedName = draft?.query === query ? draft.name : `Stay #${stayId}`;
  const allowed = ['stays', 'stay-bookings', 'stay-bookings.view'].every((p) => can(profile, p));
  const choicesLoad = useCallback(
    (signal: AbortSignal) => (allowed ? stays.stays(page, signal) : Promise.resolve(null)),
    [stays, allowed, page],
  );
  const choices = useResource(String(page), choicesLoad);
  const load = useCallback(
    (signal: AbortSignal) => {
      const next = new URLSearchParams(query);
      next.delete('stay_id');
      return allowed && stayId ? api.get(stayId, next, signal) : Promise.resolve(null);
    },
    [api, allowed, stayId, query],
  );
  const result = useResource(query, load);
  if (!allowed)
    return <p role="alert">Operations needs stay access and booking list/detail permissions.</p>;
  return (
    <>
      <h1>Stay operations</h1>
      <p>
        Selected-date arrivals/departures and current attendance queues. Cancelled bookings are
        excluded. Open a booking to use its permitted check-in/check-out actions.
      </p>
      <form
        key={query}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          try {
            const f = new FormData(e.currentTarget),
              id = String(f.get('stay_id') || ''),
              date = operationDate(String(f.get('date') || ''));
            if (!/^[1-9]\d*$/.test(id)) throw new Error('Choose a stay.');
            setParams(new URLSearchParams({ stay_id: id, date, view: 'arrivals' }));
          } catch (e) {
            setError(e);
          }
        }}
      >
        {choices.loading ? (
          <p>Loading stays…</p>
        ) : choices.error ? (
          <>
            <Failure error={choices.error} />
            <button type="button" onClick={choices.retry}>
              Retry stay choices
            </button>
          </>
        ) : choices.data ? (
          <>
            <label>
              Operations stay
              <select
                name="stay_id"
                required
                defaultValue={selected}
                onChange={(e) => {
                  setDraft({ query, id: e.target.value, name: e.target.selectedOptions[0].text });
                  const input = e.currentTarget.form!.elements.namedItem(
                    'date',
                  ) as HTMLInputElement;
                  if (!input.value) {
                    const stay = choices.data!.data.find((s) => s.id === Number(e.target.value));
                    if (stay) input.value = localStayDate(stay.timezone);
                  }
                }}
              >
                <option value="">Choose stay</option>
                {selected && !choices.data.data.some((s) => String(s.id) === selected) && (
                  <option value={selected}>{selectedName}</option>
                )}
                {choices.data.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.city}
                    {!s.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Pagination meta={choices.data.meta} onPage={setPage} />
          </>
        ) : null}
        <label>
          Scheduled date
          <input
            type="date"
            name="date"
            required
            defaultValue={params.get('date') || result.data?.context.date || ''}
          />
        </label>
        <button disabled={choices.loading}>Show operations</button>
      </form>
      {error ? <Failure error={error} /> : null}
      {!stayId ? (
        <p>Select a stay and scheduled date.</p>
      ) : result.loading ? (
        <p role="status">Loading operations…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry operations</button>
        </>
      ) : result.data ? (
        <>
          <section className="staff-panel">
            <h2>{result.data.context.stay_name}</h2>
            <p>
              Scheduled date: {result.data.context.date} · Today: {result.data.context.today} ·{' '}
              {result.data.context.timezone}
            </p>
            <p>
              Updated:{' '}
              {new Date(result.data.context.as_of).toLocaleString(undefined, {
                timeZone: result.data.context.timezone,
              })}
            </p>
            <button onClick={result.retry}>Refresh operations</button>
            <div className="staff-paging">
              {OPERATION_VIEWS.map((v) => (
                <button
                  key={v}
                  aria-pressed={result.data!.context.view === v}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.set('view', v);
                    next.delete('page');
                    setParams(next);
                  }}
                >
                  {titles[v]} ({result.data!.context.counts[v]})
                </button>
              ))}
            </div>
          </section>
          <h2>{titles[result.data.context.view]}</h2>
          <p>
            {['in_house', 'overdue'].includes(result.data.context.view)
              ? 'Live attendance as of the update time, independent of the selected scheduled date. Overdue means scheduled checkout date is before today and departure has not been recorded.'
              : 'All confirmed bookings scheduled for the selected date, including recorded arrivals/departures. Attendance below shows progress.'}
          </p>
          <div className="staff-records">
            {result.data.data.map((row) => (
              <article className="staff-panel" key={row.id}>
                <h3>
                  <Link to={`/staff/stay-bookings/${row.id}`}>
                    {row.guest_name} — {row.room_name} #{row.id}
                  </Link>
                </h3>
                <p>
                  {row.check_in} → {row.check_out} · {row.rooms} rooms · {row.guests} guests
                </p>
                <p>Attendance: {label(row.attendance_status)}</p>
              </article>
            ))}
            {!result.data.data.length && <p>No bookings in this operations queue.</p>}
          </div>
          <Pagination
            meta={result.data.meta}
            onPage={(nextPage) => {
              const next = new URLSearchParams(params);
              next.set('page', String(nextPage));
              setParams(next);
            }}
          />
        </>
      ) : null}
    </>
  );
}
