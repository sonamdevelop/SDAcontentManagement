import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { can } from './api';
import { useAuth } from './session';
import { Failure, Pagination } from './StaffUi';
import { StayApi } from './stays';
import { netCash, StayReportApi, STAY_REPORT_PERMISSIONS } from './stay-reports';

export function StayReportPage() {
  const { api: staff, profile } = useAuth();
  const api = useMemo(() => new StayReportApi(staff), [staff]);
  const stays = useMemo(() => new StayApi(staff), [staff]);
  const [params, setParams] = useSearchParams(),
    query = params.toString();
  const stay = params.get('stay_id') || '',
    from = params.get('from') || '',
    to = params.get('to') || '';
  const allowed = STAY_REPORT_PERMISSIONS.every((p) => can(profile, p));
  const [choicePage, setChoicePage] = useState(1);
  const loadChoices = useCallback(
    (signal: AbortSignal) => (allowed ? stays.stays(choicePage, signal) : Promise.resolve(null)),
    [stays, allowed, choicePage],
  );
  const choices = useResource(String(choicePage), loadChoices);
  const load = useCallback(
    (signal: AbortSignal) =>
      allowed && stay ? api.get(stay, from, to, signal) : Promise.resolve(null),
    [api, allowed, stay, from, to],
  );
  const result = useResource(query, load);
  const [downloadError, setDownloadError] = useState<unknown>();
  const [downloading, setDownloading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const urls = useRef(new Map<string, number>());
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
    setDownloadError(undefined);
  }, [query, allowed, api]);
  async function download() {
    if (controller.current || !allowed || !result.data) return;
    const active = new AbortController();
    controller.current = active;
    setDownloading(true);
    setDownloadError(undefined);
    try {
      const { blob, filename } = await api.download(stay, from, to, active.signal);
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
      if (!active.signal.aborted && mounted.current) setDownloadError(e);
    } finally {
      if (controller.current === active) controller.current = null;
      if (mounted.current) setDownloading(false);
    }
  }
  if (!allowed)
    return (
      <p role="alert">
        Stay analytics needs stay, booking list/detail and payment ledger permissions.
      </p>
    );
  return (
    <>
      <h1>Stay occupancy and cash report</h1>
      <p>
        Confirmed reservations visible to your role, compared with current inventory across active
        and inactive room types. These are booked room-nights, not measured attendance or historical
        inventory. Checkout/end dates are exclusive.
      </p>
      <form
        key={query + ':' + choicePage}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setParams(
            new URLSearchParams({
              stay_id: String(data.get('stay_id') || ''),
              from: String(data.get('from') || ''),
              to: String(data.get('to') || ''),
            }),
          );
        }}
      >
        {choices.error ? <Failure error={choices.error} /> : null}
        <label>
          Report stay
          <select name="stay_id" required defaultValue={stay}>
            <option value="">Choose stay</option>
            {stay && !choices.data?.data.some((s) => String(s.id) === stay) && (
              <option value={stay}>Stay #{stay}</option>
            )}
            {choices.data?.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.city}
                {s.active ? '' : ' (inactive)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          Report from
          <input
            name="from"
            type="date"
            min="1000-01-01"
            max="9998-12-31"
            required
            defaultValue={from}
          />
        </label>
        <label>
          Report until (exclusive)
          <input
            name="to"
            type="date"
            min="1000-01-02"
            max="9998-12-31"
            required
            defaultValue={to}
          />
        </label>
        <button disabled={choices.loading}>Show stay report</button>
      </form>
      {choices.data && <Pagination meta={choices.data.meta} onPage={setChoicePage} />}
      {choices.error && <button onClick={choices.retry}>Retry stay choices</button>}
      {!stay ? (
        <p>Select a stay and a range of 1–62 nights.</p>
      ) : result.loading ? (
        <p role="status">Loading stay report…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry stay report</button>
        </>
      ) : result.data ? (
        <>
          <section className="staff-panel">
            <h2>{result.data.context.stay_name}</h2>
            <p>
              {from} → {to} · {result.data.context.timezone} · As of{' '}
              {new Date(result.data.context.as_of).toLocaleString()}
            </p>
            <button onClick={result.retry}>Refresh stay report</button>
            <button disabled={downloading} onClick={() => void download()}>
              {downloading ? 'Preparing CSV…' : 'Export stay report CSV'}
            </button>
            <p>
              Export creates a fresh snapshot for these filters; its as-of time may differ from this
              screen.
            </p>
            {downloadError ? <Failure error={downloadError} /> : null}
            <p>
              Booked room-nights: {result.data.summary.booked_room_nights} · Current inventory
              room-nights: {result.data.summary.inventory_room_nights} · Confirmed bookings:{' '}
              {result.data.summary.confirmed_bookings}
            </p>
            <p>
              Visible booked / current capacity:{' '}
              {result.data.summary.inventory_room_nights
                ? (
                    (100 * result.data.summary.booked_room_nights) /
                    result.data.summary.inventory_room_nights
                  ).toFixed(1) + '%'
                : 'Unavailable (zero inventory)'}
              . Restricted booking scope may omit reservations.
            </p>
          </section>
          <section className="staff-panel">
            <h2>Booked value by currency</h2>
            <p>
              Nightly price snapshots × rooms × nights within the range. Excludes cancelled
              bookings; not collected cash or recognized revenue.
            </p>
            {result.data.booked_value.map((r) => (
              <p key={r.currency}>
                {r.currency} {r.amount}
              </p>
            ))}
            {!result.data.booked_value.length && <p>No visible confirmed booked value.</p>}
          </section>
          <section className="staff-panel">
            <h2>Offline cash movement</h2>
            <p>
              Entries recorded within these stay-local dates, including cancelled bookings and
              opening advances. Reversals adjust their recording day. Totals can be negative. No
              currency conversion or online collection.
            </p>
            {result.data.cash_movement.map((r) => (
              <div key={r.currency}>
                <h3>{r.currency}</h3>
                <p>
                  Receipts / corrections: {r.receipts} · Refunds / corrections: {r.refunds} · Net
                  movement: {netCash(r.receipts, r.refunds)}
                </p>
              </div>
            ))}
            {!result.data.cash_movement.length && <p>No visible ledger movements in this range.</p>}
          </section>
          <section className="staff-panel">
            <h2>Nightly reservations</h2>
            {result.data.days.map((d) => (
              <div key={d.date} className="stay-report-night">
                <span>
                  {d.date}: {d.booked_rooms} / {d.inventory_rooms} rooms
                  {d.over_capacity ? ' · Above current capacity' : ''}
                </span>
                <meter
                  aria-label={`Booked rooms ${d.date}`}
                  min={0}
                  max={Math.max(1, d.inventory_rooms, d.booked_rooms)}
                  value={d.booked_rooms}
                />
              </div>
            ))}
          </section>
        </>
      ) : null}
    </>
  );
}
