import { useRef, useState } from 'react';
import { label } from '../domain/property';
import { PendingBooking, localStayDate } from '../staff/stays';
import { useMutation } from '../staff/StaffUi';
import { CustomerApi, CustomerError, type CustomerBooking } from './api';
import { CustomerFailure } from './CustomerUi';
export function CustomerCancellationPanel({
  api,
  booking,
  onRefresh,
}: {
  api: CustomerApi;
  booking: CustomerBooking;
  onRefresh: () => void;
}) {
  const [reason, setReason] = useState(''),
    [review, setReview] = useState(false),
    [uncertain, setUncertain] = useState(false),
    pending = useRef(new PendingBooking()),
    mutation = useMutation();
  const requests = booking.cancellation_requests || [],
    eligible =
      booking.status === 'confirmed' &&
      !booking.checked_in_at &&
      booking.check_in > localStayDate(booking.timezone) &&
      !requests.some((r) => r.status === 'pending');
  async function save() {
    const body = pending.current.prepare({ reason: reason.trim() }) as {
      reason: string;
      request_id: string;
    };
    const wasUncertain = uncertain;
    await mutation.run(async () => {
      try {
        await api.requestCancellation(booking.id, body);
        pending.current.resolved();
        if (mutation.isActive()) onRefresh();
      } catch (e) {
        if (
          !wasUncertain &&
          e instanceof CustomerError &&
          [401, 403, 404, 409, 422, 429].includes(e.status)
        ) {
          pending.current.resolved();
          setReview(false);
        } else setUncertain(true);
        throw e;
      }
    }, '');
  }
  return (
    <section className="stay-card">
      <h3>Cancellation requests</h3>
      <p>
        A request does not cancel your booking or release rooms. Staff review is required. No money
        is refunded automatically.
      </p>
      {requests.map((r) => (
        <article className="staff-panel" key={r.id}>
          <h4>
            Request #{r.id}: {label(r.status)}
          </h4>
          <p>Requested: {r.created_at}</p>
          <p>Your reason: {r.reason}</p>
          {r.decision_reason && <p>Staff response: {r.decision_reason}</p>}
          {r.decided_at && <p>Reviewed: {r.decided_at}</p>}
        </article>
      ))}
      {eligible && !review && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) setReview(true);
          }}
        >
          <label>
            Cancellation request reason
            <textarea
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button>Review cancellation request</button>
        </form>
      )}
      {review && (
        <section aria-label="Review cancellation request">
          <p>Request reason: {reason.trim()}</p>
          <p>The booking stays confirmed until staff approval.</p>
          <button disabled={mutation.busy} onClick={() => void save()}>
            {uncertain ? 'Retry same cancellation request' : 'Send cancellation request'}
          </button>
          {!uncertain && (
            <button disabled={mutation.busy} onClick={() => setReview(false)}>
              Edit cancellation request
            </button>
          )}
        </section>
      )}
      {uncertain && (
        <p role="alert">
          The response is uncertain. Retry the same request; check refreshed booking history before
          starting another.
        </p>
      )}
      {!eligible && !review && (
        <p>
          New requests are unavailable while one is pending, after cancellation, or from the arrival
          date. Contact the stay team for help.
        </p>
      )}
      {mutation.error ? <CustomerFailure error={mutation.error} /> : null}
      <p>
        Pending drafts are kept only on this page. After leaving or reloading, check your booking
        history before submitting again.
      </p>
    </section>
  );
}
