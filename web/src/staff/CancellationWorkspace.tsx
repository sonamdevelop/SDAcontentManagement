import { useCallback, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import {
  CancellationApi,
  cancellationFilters,
  type CancellationQueueRow,
} from '../domain/cancellations';
import { label } from '../domain/property';
import { can, StaffError } from './api';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
export function CancellationQueue() {
  const { api, profile } = useAuth(),
    client = useMemo(() => new CancellationApi(api), [api]),
    [params, setParams] = useSearchParams(),
    query = params.toString(),
    allowed = ['stay-bookings', 'stay-bookings.view'].every((p) => can(profile, p));
  const load = useCallback(
      (signal: AbortSignal) =>
        allowed ? client.list(new URLSearchParams(query), signal) : Promise.resolve(null),
      [client, query, allowed],
    ),
    result = useResource(query, load),
    [error, setError] = useState<unknown>();
  if (!allowed)
    return <p role="alert">You do not have permission to review cancellation requests.</p>;
  return (
    <>
      <h1>Customer cancellation requests</h1>
      <p>
        Approval cancels the booking and releases rooms. Refunds remain separate offline ledger
        actions.
      </p>
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setParams(
              cancellationFilters(
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
          Request status
          <select
            aria-label="Request status"
            name="status"
            defaultValue={params.get('status') || 'pending'}
          >
            {['pending', 'approved', 'rejected', 'closed'].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Request booking ID
          <input
            name="booking_id"
            inputMode="numeric"
            defaultValue={params.get('booking_id') || ''}
          />
        </label>
        <button>Filter cancellation requests</button>
      </form>
      {error ? <Failure error={error} /> : null}
      <button onClick={result.retry}>Refresh cancellation queue</button>
      {result.loading ? (
        <p>Loading cancellation requests…</p>
      ) : result.error ? (
        <Failure error={result.error} />
      ) : result.data ? (
        <>
          <div className="staff-grid">
            {result.data.data.map((r) => (
              <CancellationReview
                key={r.id + ':' + r.status}
                row={r}
                client={client}
                writable={can(profile, 'stay-bookings.cancel')}
                onSaved={result.retry}
              />
            ))}
            {!result.data.data.length && <p>No cancellation requests match these filters.</p>}
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
function CancellationReview({
  row,
  client,
  writable,
  onSaved,
}: {
  row: CancellationQueueRow;
  client: CancellationApi;
  writable: boolean;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve'),
    [reason, setReason] = useState(''),
    [review, setReview] = useState(false),
    [uncertain, setUncertain] = useState(false),
    mutation = useMutation();
  async function save() {
    const wasUncertain = uncertain;
    await mutation.run(async () => {
      try {
        await client.decide(row.id, { decision, decision_reason: reason.trim() });
        if (mutation.isActive()) onSaved();
      } catch (e) {
        if (
          !wasUncertain &&
          e instanceof StaffError &&
          [401, 403, 404, 409, 422, 429].includes(e.status)
        )
          setReview(false);
        else setUncertain(true);
        throw e;
      }
    }, '');
  }
  return (
    <article className="staff-panel">
      <h2>Cancellation request #{row.id}</h2>
      <Link to={`/staff/stay-bookings/${row.booking_id}`}>
        Booking #{row.booking_id}: {row.stay_name} — {row.room_name}
      </Link>
      <p>
        {row.check_in} → {row.check_out} · {row.timezone} · {label(row.status)}
      </p>
      <p>Customer reason: {row.reason}</p>
      {row.decision_reason && <p>Staff response: {row.decision_reason}</p>}
      {writable &&
        row.status === 'pending' &&
        (!review ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim()) setReview(true);
            }}
          >
            <label>
              Cancellation decision
              <select
                aria-label="Cancellation decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as 'approve' | 'reject')}
              >
                <option value="approve">Approve cancellation</option>
                <option value="reject">Reject request</option>
              </select>
            </label>
            <label>
              Customer-visible decision reason
              <textarea
                required
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button>Review cancellation decision</button>
          </form>
        ) : (
          <section aria-label="Review cancellation decision">
            <p>
              {decision === 'approve'
                ? 'Approve: cancel this booking and release its rooms. No money will be transferred.'
                : 'Reject: keep this booking confirmed and its rooms allocated.'}
            </p>
            <p>Response sent to customer: {reason.trim()}</p>
            <button disabled={mutation.busy} onClick={() => void save()}>
              {uncertain ? 'Retry same cancellation decision' : 'Confirm cancellation decision'}
            </button>
            {!uncertain && (
              <button disabled={mutation.busy} onClick={() => setReview(false)}>
                Edit cancellation decision
              </button>
            )}
          </section>
        ))}
      {uncertain && (
        <p role="alert">
          Response uncertain. Retry the same decision or refresh the queue to inspect its final
          state.
        </p>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </article>
  );
}
