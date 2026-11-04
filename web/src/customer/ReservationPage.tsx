import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatPrice } from '../domain/property';
import { bookingWindow, PendingBooking, quotedTotal } from '../staff/stays';
import { useMutation } from '../staff/StaffUi';
import { CustomerApi, CustomerError, type Customer } from './api';
import { CustomerFailure } from './CustomerUi';
import { reservationDraft, type CustomerAvailability, type ReservationDraft } from './reservation';
export function ReservationPage(props: {
  api: CustomerApi;
  customer: Customer;
  onReauth: () => void;
}) {
  const [params] = useSearchParams(),
    id = params.get('room_type_id') || '';
  return <ReservationForm key={id} {...props} roomId={id} />;
}
function ReservationForm({
  api,
  customer,
  onReauth,
  roomId,
}: {
  api: CustomerApi;
  customer: Customer;
  onReauth: () => void;
  roomId: string;
}) {
  const navigate = useNavigate(),
    mutation = useMutation(),
    pending = useRef(new PendingBooking());
  const [quote, setQuote] = useState<CustomerAvailability | null>(null),
    [review, setReview] = useState<ReservationDraft | null>(null),
    [uncertain, setUncertain] = useState(false);
  if (!/^[1-9]\d*$/.test(roomId) || !Number.isSafeInteger(Number(roomId)))
    return (
      <>
        <h2>Reserve a stay room</h2>
        <p>
          Choose a room from the <Link to="/stays">stay catalogue</Link> to check dates.
        </p>
      </>
    );
  async function save() {
    if (!review) return;
    const body = pending.current.prepare(review) as ReservationDraft & { request_id: string };
    const wasUncertain = uncertain;
    await mutation.run(async () => {
      setUncertain(false);
      try {
        const booking = await api.reserve(body);
        pending.current.resolved();
        if (mutation.isActive()) navigate(`/account/bookings/${booking.id}`, { replace: true });
      } catch (error) {
        if (
          !wasUncertain &&
          error instanceof CustomerError &&
          [401, 403, 404, 409, 422, 429].includes(error.status)
        ) {
          pending.current.resolved();
          setReview(null);
          setQuote(null);
        } else setUncertain(true);
        throw error;
      }
    }, '');
  }
  return (
    <>
      <h2>Reserve a stay room</h2>
      <Link to="/stays">Choose a different stay or room</Link>
      <p>
        Confirmation reserves the selected rooms immediately. No payment is collected; the full
        balance remains due. Refreshing availability does not hold rooms.
      </p>
      {!customer.email_verified_at && (
        <p>
          Verify your email in <Link to="/account">My profile</Link> before creating a reservation.
          You can still check dates.
        </p>
      )}
      {!review && (
        <form
          className="staff-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void mutation.run(async () => {
              setQuote(null);
              const dates = bookingWindow(
                String(f.get('check_in') || ''),
                String(f.get('check_out') || ''),
              );
              const result = await api.availability(roomId, dates);
              if (mutation.isActive()) setQuote(result);
            }, '');
          }}
        >
          <fieldset disabled={mutation.busy}>
            <label>
              Reservation check-in
              <input name="check_in" type="date" required />
            </label>
            <label>
              Reservation check-out
              <input name="check_out" type="date" required />
            </label>
            <button>Check room availability</button>
          </fieldset>
        </form>
      )}
      {quote && (
        <section className="stay-card">
          <h3>
            {quote.stay_name} — {quote.room_name}
          </h3>
          <p>
            {quote.check_in} → {quote.check_out} · {quote.nights} nights · {quote.timezone}
          </p>
          <p>
            {quote.available_rooms} rooms available · Up to {quote.capacity} guests per room ·{' '}
            {formatPrice(quote.nightly_rate, quote.currency)} per room/night
          </p>
        </section>
      )}
      {quote && !review && quote.available_rooms > 0 && customer.email_verified_at && (
        <form
          className="staff-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<
              string,
              string
            >;
            void mutation.run(async () => setReview(reservationDraft(quote, values)), '');
          }}
        >
          <fieldset disabled={mutation.busy}>
            <label>
              Reservation rooms
              <input
                name="rooms"
                type="number"
                min="1"
                max={quote.available_rooms}
                step="1"
                required
                defaultValue="1"
              />
            </label>
            <label>
              Reservation guests
              <input
                name="guests"
                type="number"
                min="1"
                max="10000"
                step="1"
                required
                defaultValue="1"
              />
            </label>
            <label>
              Reservation guest name
              <input name="guest_name" maxLength={150} required defaultValue={customer.name} />
            </label>
            <label>
              Reservation guest phone
              <input
                name="guest_phone"
                type="tel"
                maxLength={30}
                defaultValue={customer.phone || ''}
              />
            </label>
            <button>Review reservation</button>
          </fieldset>
        </form>
      )}
      {quote?.available_rooms === 0 && !review && (
        <p>No rooms are available for these dates. Choose another range or room.</p>
      )}
      {review && quote && (
        <section className="stay-card" aria-label="Review stay reservation">
          <h3>Review your reservation</h3>
          <p>
            Guest: {review.guest_name} · {review.rooms} rooms · {review.guests} guests
          </p>
          <p>
            Reservation total:{' '}
            {formatPrice(
              quotedTotal(quote.nightly_rate, review.rooms, quote.nights),
              quote.currency,
            )}
          </p>
          <p>
            Payment collected online: {formatPrice('0.00', quote.currency)}. Your reservation will
            appear in My bookings.
          </p>
          {uncertain && (
            <p role="alert">
              The response is uncertain. Retry the same reservation here; do not start a replacement
              yet.
            </p>
          )}
          <button disabled={mutation.busy} onClick={() => void save()}>
            {mutation.busy
              ? 'Confirming reservation…'
              : uncertain
                ? 'Retry same reservation'
                : 'Confirm reservation'}
          </button>
          {!uncertain && (
            <button
              disabled={mutation.busy}
              onClick={() => {
                pending.current.resolved();
                setReview(null);
              }}
            >
              Edit reservation
            </button>
          )}
        </section>
      )}
      {mutation.error ? (
        <>
          <CustomerFailure error={mutation.error} />
          {mutation.error instanceof CustomerError && mutation.error.status === 403 && (
            <button onClick={onReauth}>Sign in again</button>
          )}
          <Link to="/account/bookings">Check my bookings</Link>
        </>
      ) : null}
      <p>
        Pending requests stay only on this open page. If you leave or reload after an uncertain
        response, check My bookings before making a new reservation.
      </p>
    </>
  );
}
