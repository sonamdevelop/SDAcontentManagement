import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label } from '../domain/property';
import { can } from './api';
import { useAuth } from './session';
import { Failure, Pagination } from './StaffUi';
import { StayApi } from './stays';
import { PaymentFollowUpApi, FOLLOW_UP_VIEWS, type PaymentFollowUpView } from './payment-followups';
const titles: Record<PaymentFollowUpView, string> = {
  collection: 'Pending collection',
  refund: 'Pending refund',
};
export function PaymentFollowUpPage() {
  const { api: staff, profile } = useAuth(),
    api = useMemo(() => new PaymentFollowUpApi(staff), [staff]),
    stays = useMemo(() => new StayApi(staff), [staff]);
  const [params, setParams] = useSearchParams(),
    query = params.toString(),
    stayId = params.get('stay_id') || '';
  const [choicePage, setChoicePage] = useState(1);
  const [draft, setDraft] = useState<{ query: string; id: string; name: string } | null>(null);
  const selected = draft?.query === query ? draft.id : stayId;
  const allowed = ['stays', 'stay-bookings', 'stay-bookings.view', 'stay-bookings.payments'].every(
    (p) => can(profile, p),
  );
  const choicesLoad = useCallback(
    (signal: AbortSignal) => (allowed ? stays.stays(choicePage, signal) : Promise.resolve(null)),
    [stays, allowed, choicePage],
  );
  const choices = useResource(String(choicePage), choicesLoad);
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
    return (
      <p role="alert">
        Payment follow-up needs stay, booking list/detail and payment ledger permissions.
      </p>
    );
  return (
    <>
      <h1>Stay payment follow-up</h1>
      <p>
        Current unpaid balances and refunds due from the offline ledger. Open a booking to review
        and record permitted payments or refunds. This queue does not move money.
      </p>
      <form
        key={query}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const id = String(new FormData(e.currentTarget).get('stay_id') || '');
          if (/^[1-9]\d*$/.test(id))
            setParams(new URLSearchParams({ stay_id: id, view: 'collection' }));
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
              Payment follow-up stay
              <select
                name="stay_id"
                required
                defaultValue={selected}
                onChange={(e) =>
                  setDraft({ query, id: e.target.value, name: e.target.selectedOptions[0].text })
                }
              >
                <option value="">Choose stay</option>
                {selected && !choices.data.data.some((s) => String(s.id) === selected) && (
                  <option value={selected}>
                    {draft?.query === query ? draft.name : `Stay #${stayId}`}
                  </option>
                )}
                {choices.data.data.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.city}
                    {!s.active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Pagination meta={choices.data.meta} onPage={setChoicePage} />
          </>
        ) : null}
        <button disabled={choices.loading}>Show payment follow-up</button>
      </form>
      {!stayId ? (
        <p>Select a stay to review payment follow-up.</p>
      ) : result.loading ? (
        <p role="status">Loading payment follow-up…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry payment follow-up</button>
        </>
      ) : result.data ? (
        <>
          <section className="staff-panel">
            <h2>{result.data.context.stay_name}</h2>
            <p>
              Current ledger as of {new Date(result.data.context.as_of).toLocaleString()}. Counts
              are bookings; amounts retain each booking's currency.
            </p>
            <button onClick={result.retry}>Refresh payment follow-up</button>
            <div className="staff-paging">
              {FOLLOW_UP_VIEWS.map((v) => (
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
            Oldest scheduled arrivals first. Balances include effective payments and refunds;
            reversed entries are excluded. Cancelled bookings owe no collection.
          </p>
          <div className="staff-records">
            {result.data.data.map((r) => (
              <article className="staff-panel" key={r.id}>
                <h3>
                  <Link to={`/staff/stay-bookings/${r.id}`}>
                    {r.guest_name} — {r.room_name} #{r.id}
                  </Link>
                </h3>
                <p>
                  {r.check_in} → {r.check_out} · {label(r.status)}
                </p>
                <p>
                  Net paid: {formatPrice(r.net_paid, r.currency)} · Amount due:{' '}
                  {formatPrice(r.amount_due, r.currency)}
                </p>
                <p>
                  {titles[result.data!.context.view]}:{' '}
                  {formatPrice(
                    result.data!.context.view === 'collection' ? r.balance : r.refund_due,
                    r.currency,
                  )}
                </p>
              </article>
            ))}
            {!result.data.data.length && <p>No bookings in this payment queue.</p>}
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
