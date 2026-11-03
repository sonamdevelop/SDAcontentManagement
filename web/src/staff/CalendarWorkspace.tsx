import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { useAuth } from './session';
import { can } from './api';
import { Failure, Pagination } from './StaffUi';
import { StayApi, localStayDate } from './stays';
import { CalendarApi, calendarRange, plusDays } from './calendar';
export function StayCalendarPage() {
  const { api: staff, profile } = useAuth(),
    api = useMemo(() => new CalendarApi(staff), [staff]),
    stays = useMemo(() => new StayApi(staff), [staff]);
  const [params, setParams] = useSearchParams(),
    query = params.toString(),
    room = params.get('room_type_id') || '',
    from = params.get('from') || '',
    to = params.get('to') || '',
    allowed = can(profile, 'stays');
  const [draftChoice, setDraftChoice] = useState<{
    query: string;
    id: string;
    name: string;
  } | null>(null);
  const choiceId = draftChoice?.query === query ? draftChoice.id : room;
  const choiceName = draftChoice?.query === query ? draftChoice.name : `Room type #${room}`;
  const [page, setPage] = useState(1),
    [error, setError] = useState<unknown>();
  const choicesLoad = useCallback(
    (signal: AbortSignal) => (allowed ? stays.stays(page, signal) : Promise.resolve(null)),
    [stays, allowed, page],
  );
  const choices = useResource(String(page), choicesLoad);
  const load = useCallback(
    (signal: AbortSignal) =>
      allowed && room ? api.get(room, from, to, signal) : Promise.resolve(null),
    [api, allowed, room, from, to],
  );
  const result = useResource(query, load);
  if (!allowed) return <p role="alert">You do not have permission to view stay availability.</p>;
  return (
    <>
      <div className="staff-title">
        <h1>Stay availability calendar</h1>
        <Link to="/staff/stays">Stays and rooms</Link>
      </div>
      <p>
        Nightly room-type allocation using current inventory. Checkout date is excluded. This is
        advisory availability; booking save rechecks inventory. Guest contacts and payment details
        are not shown.
      </p>
      <form
        key={query}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          try {
            const f = new FormData(e.currentTarget),
              id = String(f.get('room_type_id') || '');
            if (!/^[1-9]\d*$/.test(id)) throw new Error('Choose a room type.');
            const range = calendarRange(String(f.get('from') || ''), String(f.get('to') || ''));
            setParams(new URLSearchParams({ room_type_id: id, ...range }));
          } catch (e) {
            setError(e);
          }
        }}
      >
        {choices.loading ? (
          <p>Loading room types…</p>
        ) : choices.error ? (
          <>
            <Failure error={choices.error} />
            <button type="button" onClick={choices.retry}>
              Retry room choices
            </button>
          </>
        ) : choices.data ? (
          <>
            <label>
              Calendar room type
              <select
                required
                name="room_type_id"
                defaultValue={choiceId}
                onChange={(e) => {
                  setDraftChoice({
                    query,
                    id: e.target.value,
                    name: e.target.selectedOptions[0].text,
                  });
                  const form = e.currentTarget.form!;
                  const fromInput = form.elements.namedItem('from') as HTMLInputElement;
                  const toInput = form.elements.namedItem('to') as HTMLInputElement;
                  if (!fromInput.value && !toInput.value) {
                    const stay = choices.data!.data.find((s) =>
                      s.rooms.some((r) => r.id === Number(e.target.value)),
                    );
                    if (stay) {
                      const start = localStayDate(stay.timezone),
                        form = e.currentTarget.form!;
                      (form.elements.namedItem('from') as HTMLInputElement).value = start;
                      (form.elements.namedItem('to') as HTMLInputElement).value = plusDays(
                        start,
                        30,
                      );
                    }
                  }
                }}
              >
                <option value="">Choose room type</option>
                {choiceId &&
                  !choices.data.data.some((s) =>
                    s.rooms.some((r) => String(r.id) === choiceId),
                  ) && <option value={choiceId}>{choiceName}</option>}
                {choices.data.data.flatMap((s) =>
                  s.rooms.map((r) => (
                    <option value={r.id} key={r.id}>
                      {s.name} · {r.name}
                      {!s.active || !r.active ? ' (inactive)' : ''}
                    </option>
                  )),
                )}
              </select>
            </label>
            <Pagination meta={choices.data.meta} onPage={setPage} />
          </>
        ) : null}
        <label>
          Calendar from
          <input type="date" required name="from" defaultValue={from} />
        </label>
        <label>
          Calendar to (exclusive)
          <input type="date" required name="to" defaultValue={to} />
        </label>
        <button disabled={choices.loading}>Show calendar</button>
      </form>
      {error ? <Failure error={error} /> : null}
      {!room ? (
        <p>Choose a room type and a range of up to 62 nights.</p>
      ) : result.loading ? (
        <p role="status">Loading calendar…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry calendar</button>
        </>
      ) : result.data ? (
        <section className="staff-panel">
          <h2>
            {result.data.stay_name} — {result.data.room_name}
          </h2>
          <p>
            Timezone: {result.data.timezone} · Today: {result.data.today} · Current inventory:{' '}
            {result.data.inventory} · {result.data.active ? 'Active' : 'Inactive'}
          </p>
          <button onClick={result.retry}>Refresh calendar</button>
          <p>
            Early checkout retains the original booking allocation. Historical counts use current
            capacity; over-capacity rows may reflect later inventory changes.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="staff-calendar">
              <caption>Nightly room availability</caption>
              <thead>
                <tr>
                  <th scope="col">Night</th>
                  <th scope="col">Allocated</th>
                  <th scope="col">Available</th>
                  <th scope="col">Booking availability</th>
                </tr>
              </thead>
              <tbody>
                {result.data.days.map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{d.date}</th>
                    <td>{d.occupied_rooms}</td>
                    <td>{d.available_rooms}</td>
                    <td>
                      {d.over_capacity
                        ? 'Over current capacity'
                        : !result.data!.active
                          ? 'Inactive'
                          : d.date < result.data!.today
                            ? 'Past date'
                            : d.bookable
                              ? 'Available'
                              : 'Full'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
