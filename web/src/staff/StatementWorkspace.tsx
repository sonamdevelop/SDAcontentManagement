import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label } from '../domain/property';
import { can } from './api';
import { useAuth } from './session';
import { Failure } from './StaffUi';
import { StatementApi } from './statement';
export function StayStatementPage() {
  const { id = '' } = useParams(),
    { api: staff, profile } = useAuth(),
    api = useMemo(() => new StatementApi(staff), [staff]);
  const allowed = ['stay-bookings.view', 'stay-bookings.payments'].every((p) => can(profile, p));
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.get(id, signal) : Promise.resolve(null)),
    [api, id, allowed],
  );
  const result = useResource(id, load);
  useEffect(() => {
    document.body.classList.add('stay-statement-page');
    return () => document.body.classList.remove('stay-statement-page');
  }, []);
  if (!allowed)
    return (
      <p role="alert">Booking statements need booking detail and payment ledger permissions.</p>
    );
  if (result.loading) return <p role="status">Loading statement…</p>;
  if (result.error)
    return (
      <>
        <Failure error={result.error} />
        <button onClick={result.retry}>Retry statement</button>
      </>
    );
  if (!result.data) return null;
  const { booking: b, summary: s, entries, generated_at } = result.data;
  const money = (v: string) => formatPrice(v, s.currency);
  const time = (v: string) => new Date(v).toLocaleString(undefined, { timeZone: b.timezone });
  return (
    <>
      <div className="statement-controls">
        <Link to={`/staff/stay-bookings/${b.id}`}>Back to booking</Link>
        <button onClick={result.retry}>Refresh statement</button>
        <button onClick={() => window.print()}>Print statement</button>
      </div>
      <article className="stay-statement" aria-label="Booking statement">
        <h1>Stay booking statement #{b.id}</h1>
        <p>Offline booking account statement · Not a tax invoice</p>
        <p>
          Generated: {time(generated_at)} · {b.timezone}
        </p>
        <h2>
          {b.stay_name} — {b.room_name}
        </h2>
        <p>Guest: {b.guest_name}</p>
        <p>
          {b.check_in} → {b.check_out} · {b.rooms} rooms · {b.guests} guests
        </p>
        <p>
          Booking status: {label(s.status)} · Nightly rate per room: {money(b.nightly_rate)}
        </p>
        <h2>Account summary</h2>
        <dl className="statement-summary">
          {(
            [
              ['Booked total', s.total],
              ['Original advance', s.advance],
              ['Effective received', s.received_total],
              ['Effective refunded', s.refunded_total],
              ['Net paid', s.net_paid],
              ['Amount due', s.amount_due],
              ['Outstanding', s.balance],
              ['Refund due', s.refund_due],
            ] as const
          ).map(([title, amount]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>{money(amount)}</dd>
            </div>
          ))}
        </dl>
        <h2>Payment history</h2>
        <p>
          All {entries.length} ledger entries, in recorded order. Reversed entries and correction
          rows are shown for history and excluded from effective totals. The original advance is
          already included in the ledger.
        </p>
        <ol className="statement-entries">
          {entries.map((r) => (
            <li key={r.id}>
              <h3>
                {label(r.kind)} #{r.id} · {money(r.amount)}
              </h3>
              <p>
                {time(r.created_at)} · {label(r.method)}
              </p>
              <p>
                {r.kind === 'reversal'
                  ? `Correction of entry #${r.reversal_of}`
                  : r.reversed_by
                    ? `Reversed by entry #${r.reversed_by}`
                    : 'Included in effective totals'}
              </p>
            </li>
          ))}
        </ol>
        {!entries.length && <p>No payments or refunds recorded.</p>}
        <p>
          Amounts reflect recorded offline events as of generation time. Refresh to include later
          changes. This statement does not collect or refund money.
        </p>
      </article>
    </>
  );
}
