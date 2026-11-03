import { Link } from 'react-router-dom';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { useResource } from '../api/useResource';
import { formatPrice, label } from '../domain/property';
import { can, StaffError } from './api';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
import { PendingBooking, type Booking } from './stays';
import { money } from './deals';
import { PaymentApi, PAYMENT_METHODS, type PaymentEntry, type FinancialSummary } from './payments';
type Action = { kind: 'payment' | 'refund' | 'reversal'; entry?: PaymentEntry };
export function PaymentPanel({
  booking,
  onUpdate,
}: {
  booking: Booking;
  onUpdate: Dispatch<SetStateAction<Booking>>;
}) {
  const { api: staff, profile } = useAuth(),
    api = useMemo(() => new PaymentApi(staff), [staff]),
    [page, setPage] = useState(1),
    [action, setAction] = useState<Action | null>(null);
  const available = booking.net_paid !== undefined;
  const allowed =
    available && can(profile, 'stay-bookings.payments') && can(profile, 'stay-bookings.view');
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.list(booking.id, page, signal) : Promise.resolve(null)),
    [api, allowed, booking.id, booking.status, page],
  );
  const result = useResource(`${booking.id}:${booking.status}:${page}`, load);
  useEffect(() => {
    if (result.data) onUpdate((b) => ({ ...b, ...result.data!.summary }));
  }, [result.data, onUpdate]);
  const permitted = (a: Action) =>
    can(
      profile,
      `stay-bookings.payments.${a.kind === 'payment' ? 'create' : a.kind === 'refund' ? 'refund' : 'reverse'}`,
    );
  const summary = result.data?.summary ?? (available ? (booking as FinancialSummary) : undefined);
  function saved(s: FinancialSummary) {
    onUpdate((b) => ({ ...b, ...s }));
    setAction(null);
    result.retry();
  }
  if (!available) return null;
  if (!allowed)
    return (
      <section className="staff-panel">
        <h2>Payment ledger</h2>
        <p>Ledger history is unavailable for your role.</p>
      </section>
    );
  return (
    <section className="staff-panel">
      <h2>Payment ledger</h2>
      <Link to={`/staff/stay-bookings/${booking.id}/statement`}>Open printable statement</Link>
      <p>
        Record payments/refunds that already occurred offline. These entries do not transfer money
        or verify receipts. Correct mistakes by reversing the entry and recording a replacement;
        original rows remain in history.
      </p>
      <button type="button" onClick={result.retry}>
        Refresh ledger
      </button>
      {result.loading ? (
        <p role="status">Loading ledger…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry ledger</button>
        </>
      ) : result.data && summary ? (
        <>
          <p>
            Original advance: {formatPrice(summary.advance, summary.currency)} · Effective received:{' '}
            {formatPrice(summary.received_total, summary.currency)} · Refunded:{' '}
            {formatPrice(summary.refunded_total, summary.currency)}
          </p>
          <p>
            Net paid: {formatPrice(summary.net_paid, summary.currency)} · Outstanding:{' '}
            {formatPrice(summary.balance, summary.currency)} · Refund due:{' '}
            {formatPrice(summary.refund_due, summary.currency)}
          </p>
          {!action && (
            <div className="staff-paging">
              {summary.status === 'confirmed' &&
                summary.balance !== '0.00' &&
                permitted({ kind: 'payment' }) && (
                  <button onClick={() => setAction({ kind: 'payment' })}>Record payment</button>
                )}
              {summary.net_paid !== '0.00' && permitted({ kind: 'refund' }) && (
                <button onClick={() => setAction({ kind: 'refund' })}>Record refund</button>
              )}
            </div>
          )}
          <div className="staff-records">
            {result.data.data.map((entry) => (
              <article className="staff-panel" key={entry.id}>
                <h3>
                  {label(entry.kind)} #{entry.id}
                </h3>
                <p>
                  {formatPrice(entry.amount, entry.currency)} · {label(entry.method)}
                </p>
                <p>Reference: {entry.reference || 'Not recorded'}</p>
                {entry.reason && <p className="staff-message">Reason: {entry.reason}</p>}
                <p>
                  {new Date(entry.created_at).toLocaleString()} · Staff #
                  {entry.actor_id ?? 'unknown'}
                </p>
                {entry.kind === 'opening_advance' && (
                  <p>Original booking advance; payment method was not captured.</p>
                )}
                {entry.reversed_by && <p>Reversed by entry #{entry.reversed_by}</p>}
                {entry.reversal_of && <p>Reversal of entry #{entry.reversal_of}</p>}
                {!action &&
                  entry.kind !== 'reversal' &&
                  !entry.reversed_by &&
                  permitted({ kind: 'reversal' }) && (
                    <button onClick={() => setAction({ kind: 'reversal', entry })}>
                      Correct entry #{entry.id}
                    </button>
                  )}
              </article>
            ))}
          </div>
          {!result.data.data.length && <p>No financial entries yet.</p>}
          <Pagination meta={result.data.meta} onPage={setPage} />
        </>
      ) : null}
      {action && summary && (
        <PaymentForm
          key={`${action.kind}:${action.entry?.id || ''}`}
          action={action}
          booking={booking}
          summary={summary}
          allowed={permitted(action)}
          api={api}
          onSaved={saved}
          onClose={() => setAction(null)}
        />
      )}
    </section>
  );
}
function PaymentForm({
  action,
  booking,
  summary,
  allowed,
  api,
  onSaved,
  onClose,
}: {
  action: Action;
  booking: Booking;
  summary: FinancialSummary;
  allowed: boolean;
  api: PaymentApi;
  onSaved: (s: FinancialSummary) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState({ amount: '', method: 'cash', reference: '', reason: '' }),
    [uncertain, setUncertain] = useState(false),
    [review, setReview] = useState(false),
    mutation = useMutation(),
    request = useRef(new PendingBooking());
  const reversal = action.kind === 'reversal';
  const title = reversal
    ? 'Reverse incorrect entry'
    : action.kind === 'refund'
      ? 'Record offline refund'
      : 'Record offline payment';
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void mutation.run(async () => {
          if (!allowed) throw new StaffError(403);
          if (!review) throw new Error('Review the financial entry first.');
          const data: Record<string, unknown> = reversal
            ? { reason: values.reason.trim() }
            : {
                ...values,
                amount: money(values.amount),
                reason: values.reason.trim() || null,
                reference: values.reference.trim() || null,
              };
          if (action.kind !== 'payment' && !values.reason.trim())
            throw new Error('A reason is required.');
          if (!reversal) {
            const amount = BigInt(String(data.amount).replace('.', '')),
              limit = BigInt(
                (action.kind === 'payment' ? summary.balance : summary.net_paid).replace('.', ''),
              );
            if (
              amount <= 0n ||
              (!uncertain &&
                (amount > limit || (action.kind === 'payment' && summary.status !== 'confirmed')))
            )
              throw new Error('Amount exceeds the available balance or is not positive.');
          }
          const payload = request.current.prepare(data);
          try {
            const result = await api.record(booking.id, action.kind, payload, action.entry?.id);
            request.current.resolved();
            if (mutation.isActive()) onSaved(result.summary);
          } catch (e) {
            if (mutation.isActive()) {
              if (e instanceof StaffError && [401, 403, 404, 422].includes(e.status)) {
                request.current.resolved();
                setUncertain(false);
                setReview(false);
              } else setUncertain(true);
            }
            throw e;
          }
        }, '');
      }}
      className="staff-panel"
    >
      <h3>{title}</h3>
      <fieldset
        className="staff-visit-fieldset"
        disabled={mutation.busy || uncertain || review || !allowed}
      >
        {reversal ? (
          <p>
            Entry #{action.entry!.id}: {label(action.entry!.kind)} ·{' '}
            {formatPrice(action.entry!.amount, action.entry!.currency)}. This adds a reversal and
            never erases the original.
          </p>
        ) : (
          <>
            <label>
              Ledger amount
              <input
                required
                inputMode="decimal"
                maxLength={16}
                value={values.amount}
                onChange={(e) => setValues({ ...values, amount: e.target.value })}
              />
            </label>
            <label>
              Payment method
              <select
                value={values.method}
                onChange={(e) => setValues({ ...values, method: e.target.value })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {label(m)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ledger reference
              <input
                maxLength={190}
                value={values.reference}
                onChange={(e) => setValues({ ...values, reference: e.target.value })}
              />
            </label>
          </>
        )}
        <label>
          Ledger reason{action.kind !== 'payment' ? ' *' : ''}
          <textarea
            required={action.kind !== 'payment'}
            maxLength={1000}
            value={values.reason}
            onChange={(e) => setValues({ ...values, reason: e.target.value })}
          />
        </label>
      </fieldset>
      {!review ? (
        <button
          type="button"
          disabled={!allowed || mutation.busy}
          onClick={(e) => {
            if (e.currentTarget.form?.reportValidity()) setReview(true);
          }}
        >
          Review entry
        </button>
      ) : (
        <>
          <p>
            Confirm{' '}
            {action.kind === 'reversal'
              ? `reversal of entry #${action.entry!.id}`
              : `${action.kind} of ${formatPrice(values.amount, booking.currency)} via ${label(values.method)}`}
            ? This records an offline event; no money is sent.
          </p>
          <button disabled={mutation.busy || !allowed}>
            {mutation.busy ? 'Saving…' : 'Confirm financial entry'}
          </button>
          <button
            type="button"
            disabled={mutation.busy || uncertain}
            onClick={() => setReview(false)}
          >
            Edit financial draft
          </button>
        </>
      )}
      {uncertain && (
        <p role="alert">
          Outcome uncertain. Retry this same financial entry; do not record a replacement. Refresh
          ledger to inspect history. Leaving this form loses the pending request.
        </p>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
      <button type="button" disabled={mutation.busy || uncertain} onClick={onClose}>
        Close financial form
      </button>
    </form>
  );
}
