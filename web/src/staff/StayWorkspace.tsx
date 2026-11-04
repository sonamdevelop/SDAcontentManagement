import { bookingFilters } from './stays';
import { PaymentPanel } from './PaymentWorkspace';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label } from '../domain/property';
import { can, StaffError } from './api';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
import {
  attendanceStatus,
  canRecordAttendance,
  localStayDate,
  StayApi,
  bookingWindow,
  quotedTotal,
  PendingBooking,
  type Stay,
  type Room,
  type Booking,
  type Availability,
} from './stays';
import { money } from './deals';
function useStays() {
  const { api } = useAuth();
  return useMemo(() => new StayApi(api), [api]);
}
export function StayList() {
  const { profile } = useAuth(),
    api = useStays(),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Stay | null | undefined>();
  const allowed = can(profile, 'stays'),
    manage = allowed && can(profile, 'stays.manage');
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.stays(page, signal) : Promise.resolve(null)),
    [api, allowed, page],
  );
  const result = useResource(String(page), load);
  if (!allowed) return <p role="alert">You do not have permission to view stays.</p>;
  return (
    <>
      <div className="staff-title">
        <h1>Stays and room types</h1>
        {manage && <button onClick={() => setEdit(null)}>Add stay</button>}
      </div>
      <p>Checkout day is available for another booking. Currency: INR.</p>
      {edit !== undefined && (
        <StayForm
          key={edit?.id || 'new'}
          stay={edit}
          onSaved={() => {
            setEdit(undefined);
            result.retry();
          }}
          onCancel={() => setEdit(undefined)}
        />
      )}
      {result.loading ? (
        <p role="status">Loading stays…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry stays</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((stay) => (
              <StayCard
                key={stay.id}
                stay={stay}
                manage={manage}
                onEdit={() => setEdit(stay)}
                onSaved={result.retry}
              />
            ))}
            {!result.data.data.length && <p>No stays yet.</p>}
          </div>
          <Pagination meta={result.data.meta} onPage={setPage} />
        </>
      ) : null}
    </>
  );
}
function StayForm({
  stay,
  onSaved,
  onCancel,
}: {
  stay: Stay | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const api = useStays(),
    mutation = useMutation(),
    [values, setValues] = useState({
      name: stay?.name || '',
      city: stay?.city || '',
      timezone: stay?.timezone || 'Asia/Kolkata',
    }),
    [active, setActive] = useState(stay?.active ?? true);
  return (
    <form
      className="staff-panel"
      onSubmit={(e) => {
        e.preventDefault();
        void mutation.run(async () => {
          await api.saveStay({ ...values, active }, stay?.id);
          if (mutation.isActive()) onSaved();
        }, '');
      }}
    >
      <h2>{stay ? 'Edit stay' : 'New stay'}</h2>
      <fieldset disabled={mutation.busy}>
        {(['name', 'city', 'timezone'] as const).map((k) => (
          <label key={k}>
            Stay {k}
            <input
              required
              maxLength={k === 'name' ? 255 : k === 'city' ? 100 : 64}
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="staff-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Stay active
        </label>
        <button>Save stay</button>
        <button type="button" onClick={onCancel}>
          Close stay form
        </button>
      </fieldset>
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </form>
  );
}
function StayCard({
  stay,
  manage,
  onEdit,
  onSaved,
}: {
  stay: Stay;
  manage: boolean;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [edit, setEdit] = useState<Room | null | undefined>();
  return (
    <article className="staff-panel">
      <h2>{stay.name}</h2>
      <p>
        {stay.city} · {stay.timezone} · {stay.active ? 'Active' : 'Inactive'}
      </p>
      {manage && (
        <>
          <Link to={`/staff/stays/${stay.id}/content`}>Edit public stay content</Link>{' '}
          <button onClick={onEdit}>Edit stay</button>{' '}
          <button onClick={() => setEdit(null)}>Add room type</button>
        </>
      )}
      {stay.rooms.map((room) => (
        <section key={room.id}>
          <h3>{room.name}</h3>
          <p>
            {room.inventory} rooms · {room.capacity} guests per room ·{' '}
            {formatPrice(room.nightly_rate, 'INR')} per room/night ·{' '}
            {room.active ? 'Active' : 'Inactive'}
          </p>
          {manage && <button onClick={() => setEdit(room)}>Edit {room.name}</button>}
        </section>
      ))}
      {edit !== undefined && (
        <RoomForm
          key={edit?.id || 'new'}
          stay={stay}
          room={edit}
          onSaved={() => {
            setEdit(undefined);
            onSaved();
          }}
          onCancel={() => setEdit(undefined)}
        />
      )}
    </article>
  );
}
function RoomForm({
  stay,
  room,
  onSaved,
  onCancel,
}: {
  stay: Stay;
  room: Room | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const api = useStays(),
    mutation = useMutation(),
    [values, setValues] = useState({
      name: room?.name || '',
      inventory: String(room?.inventory || 1),
      capacity: String(room?.capacity || 2),
      nightly_rate: room?.nightly_rate || '',
    }),
    [active, setActive] = useState(room?.active ?? true);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void mutation.run(async () => {
          await api.saveRoom(
            stay.id,
            {
              ...values,
              inventory: Number(values.inventory),
              capacity: Number(values.capacity),
              nightly_rate: money(values.nightly_rate),
              active,
            },
            room?.id,
          );
          if (mutation.isActive()) onSaved();
        }, '');
      }}
    >
      <h3>{room ? 'Edit room type' : 'New room type'}</h3>
      <fieldset disabled={mutation.busy}>
        {(['name', 'inventory', 'capacity', 'nightly_rate'] as const).map((k) => (
          <label key={k}>
            {
              {
                name: 'Room type name',
                inventory: 'Room inventory',
                capacity: 'Guests per room',
                nightly_rate: 'Nightly rate (INR)',
              }[k]
            }
            <input
              required
              type={k === 'inventory' || k === 'capacity' ? 'number' : 'text'}
              min="1"
              max={k === 'capacity' ? 100 : 1000}
              maxLength={k === 'name' ? 255 : 16}
              inputMode={k === 'nightly_rate' ? 'decimal' : undefined}
              value={values[k]}
              onChange={(e) => setValues({ ...values, [k]: e.target.value })}
            />
          </label>
        ))}
        <label className="staff-check">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Room type active
        </label>
        <p>
          New rates affect new bookings. Inventory/capacity cannot change while current or future
          bookings exist.
        </p>
        <button>Save room type</button>
        <button type="button" onClick={onCancel}>
          Close room form
        </button>
      </fieldset>
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </form>
  );
}
function BookingSummary({ booking: b }: { booking: Booking }) {
  return (
    <>
      <p>Attendance: {label(attendanceStatus(b))}</p>
      <p>
        {label(b.status)} · {b.check_in} → {b.check_out} ({b.timezone})
      </p>
      <p>
        {b.rooms} rooms · {b.guests} guests
      </p>
      <p>
        Total: {formatPrice(b.total, b.currency)} · Recorded advance:{' '}
        {formatPrice(b.advance, b.currency)} · Balance: {formatPrice(b.balance, b.currency)}
        {b.net_paid !== undefined && (
          <>
            {' '}
            · Net paid: {formatPrice(b.net_paid, b.currency)} · Refund due:{' '}
            {formatPrice(b.refund_due!, b.currency)}
          </>
        )}
      </p>
    </>
  );
}
export function BookingList() {
  const api = useStays(),
    { profile } = useAuth(),
    [params, setParams] = useSearchParams(),
    query = params.toString(),
    allowed = can(profile, 'stay-bookings');
  const load = useCallback(
    (signal: AbortSignal) =>
      allowed ? api.list(new URLSearchParams(query), signal) : Promise.resolve(null),
    [api, allowed, query],
  );
  const result = useResource(query, load);
  const [filterError, setFilterError] = useState<unknown>();
  if (!allowed) return <p role="alert">You do not have permission to list stay bookings.</p>;
  return (
    <>
      <div className="staff-title">
        <h1>Stay bookings</h1>
        {['stay-bookings.create', 'stay-bookings.view', 'stays'].every((p) => can(profile, p)) && (
          <Link to="/staff/stay-bookings/new" className="button primary">
            New stay booking
          </Link>
        )}
      </div>
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          setFilterError(undefined);
          try {
            setParams(
              bookingFilters(
                Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>,
              ),
            );
          } catch (error) {
            setFilterError(error);
          }
        }}
      >
        <label>
          Booking status
          <select name="status" defaultValue={params.get('status') || ''}>
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Attendance
          <select name="attendance_status" defaultValue={params.get('attendance_status') || ''}>
            <option value="">All attendance</option>
            <option value="not_arrived">Not arrived</option>
            <option value="checked_in">Checked in</option>
            <option value="checked_out">Checked out</option>
          </select>
        </label>
        <label>
          Room type ID
          <input
            name="room_type_id"
            type="number"
            min="1"
            defaultValue={params.get('room_type_id') || ''}
          />
        </label>
        {['booking_id', 'stay_id'].map((key) => (
          <label key={key}>
            {key === 'booking_id' ? 'Booking ID' : 'Stay ID'}
            <input name={key} type="number" min="1" step="1" defaultValue={params.get(key) || ''} />
          </label>
        ))}
        <label>
          Arrival from
          <input type="date" name="arrival_from" defaultValue={params.get('arrival_from') || ''} />
        </label>
        <label>
          Arrival to
          <input type="date" name="arrival_to" defaultValue={params.get('arrival_to') || ''} />
        </label>
        <button>Filter bookings</button>
        <Link to="/staff/stay-bookings" onClick={() => setFilterError(undefined)}>
          Clear booking filters
        </Link>
      </form>
      <p>
        Arrival bounds include both dates, using each booking’s local scheduled check-in date. All
        filters combine; no guest contact search is performed.
      </p>
      {filterError ? <Failure error={filterError} /> : null}
      {result.loading ? (
        <p role="status">Loading bookings…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry bookings</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((b) => (
              <article className="staff-panel" key={b.id}>
                <h2>
                  {can(profile, 'stay-bookings.view') ? (
                    <Link to={`/staff/stay-bookings/${b.id}`}>
                      {b.stay_name} — {b.room_name} #{b.id}
                    </Link>
                  ) : (
                    `${b.stay_name} — ${b.room_name} #${b.id}`
                  )}
                </h2>
                <BookingSummary booking={b} />
              </article>
            ))}
            {!result.data.data.length && <p>No matching stay bookings.</p>}
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
export function BookingCreate() {
  const api = useStays(),
    { profile } = useAuth(),
    navigate = useNavigate(),
    mutation = useMutation(),
    pending = useRef(new PendingBooking());
  const allowed = ['stays', 'stay-bookings.create', 'stay-bookings.view'].every((p) =>
    can(profile, p),
  );
  const [page, setPage] = useState(1),
    [roomId, setRoomId] = useState(''),
    [dates, setDates] = useState({ check_in: '', check_out: '' }),
    [availability, setAvailability] = useState<Availability | null>(null),
    [uncertain, setUncertain] = useState(false);
  const [values, setValues] = useState({
    rooms: '1',
    guests: '1',
    guest_name: '',
    guest_email: '',
    guest_phone: '',
    advance: '0.00',
    payment_reference: '',
    notes: '',
  });
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.stays(page, signal) : Promise.resolve(null)),
    [api, page, allowed],
  );
  const result = useResource(String(page), load);
  const [selection, setSelection] = useState<{ id: number; name: string } | null>(null);
  if (!allowed)
    return (
      <p role="alert">Booking creation needs stay access and booking create/view permissions.</p>
    );
  let total = '';
  if (availability) {
    try {
      total = quotedTotal(availability.nightly_rate, Number(values.rooms), availability.nights);
    } catch {
      /* Submit reports invalid quantities. */
    }
  }
  return (
    <>
      <Link to="/staff/stay-bookings">← Stay bookings</Link>
      <h1>New stay booking</h1>
      <p>
        Dates use the stay timezone; checkout day is excluded. This records an offline advance
        without collecting money. Bookings are confirmed on save; cancel before check-in and rebook
        to change terms.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void mutation.run(async () => {
            if (!availability || availability.room_type_id !== Number(roomId))
              throw new Error('Check availability first.');
            const rooms = Number(values.rooms),
              guests = Number(values.guests);
            if (
              !Number.isInteger(rooms) ||
              rooms < 1 ||
              rooms > availability.available_rooms ||
              !Number.isInteger(guests) ||
              guests < 1 ||
              guests > rooms * availability.capacity
            )
              throw new Error('Choose available room quantity and guest count within capacity.');
            const total = quotedTotal(availability.nightly_rate, rooms, availability.nights),
              advance = money(values.advance || '0');
            if (BigInt(advance.replace('.', '')) > BigInt(total.replace('.', '')))
              throw new Error('Advance cannot exceed total.');
            const data = pending.current.prepare({
              ...values,
              rooms,
              guests,
              advance,
              ...bookingWindow(dates.check_in, dates.check_out),
              room_type_id: Number(roomId),
              expected_rate: availability.nightly_rate,
            });
            try {
              const saved = await api.reserve(data);
              pending.current.resolved();
              if (mutation.isActive()) navigate(`/staff/stay-bookings/${saved.id}`);
            } catch (e) {
              if (mutation.isActive()) {
                if (e instanceof StaffError && [401, 403, 404, 422].includes(e.status)) {
                  pending.current.resolved();
                  setUncertain(false);
                  setAvailability(null);
                } else setUncertain(true);
              }
              throw e;
            }
          }, '');
        }}
      >
        <fieldset className="staff-visit-fieldset" disabled={mutation.busy || uncertain}>
          {result.loading ? (
            <p>Loading room types…</p>
          ) : result.error ? (
            <>
              <Failure error={result.error} />
              <button type="button" onClick={result.retry}>
                Retry room types
              </button>
            </>
          ) : result.data ? (
            <>
              <label>
                Booking room type
                <select
                  required
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    setSelection(
                      e.target.value
                        ? { id: Number(e.target.value), name: e.target.selectedOptions[0].text }
                        : null,
                    );
                    setAvailability(null);
                  }}
                >
                  <option value="">Choose room type</option>
                  {selection &&
                    !result.data.data.some((s) => s.rooms.some((r) => r.id === selection.id)) && (
                      <option value={selection.id}>{selection.name}</option>
                    )}
                  {result.data.data.flatMap((s) =>
                    s.active
                      ? s.rooms
                          .filter((r) => r.active)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {s.name} · {r.name} · {s.timezone}
                            </option>
                          ))
                      : [],
                  )}
                </select>
              </label>
              <Pagination meta={result.data.meta} onPage={setPage} />
            </>
          ) : null}
          {(['check_in', 'check_out'] as const).map((k) => (
            <label key={k}>
              {k === 'check_in' ? 'Check-in date' : 'Check-out date'}
              <input
                required
                type="date"
                value={dates[k]}
                onChange={(e) => {
                  setDates({ ...dates, [k]: e.target.value });
                  setAvailability(null);
                }}
              />
            </label>
          ))}
          <button
            type="button"
            disabled={!roomId}
            onClick={() => {
              void mutation.run(async () => {
                const data = await api.availability(
                  Number(roomId),
                  bookingWindow(dates.check_in, dates.check_out),
                );
                if (mutation.isActive()) setAvailability(data);
              }, '');
            }}
          >
            Check availability
          </button>
          {availability && (
            <p role="status">
              {availability.available_rooms} rooms available · {availability.capacity} guests per
              room · {availability.nights} nights ·{' '}
              {formatPrice(availability.nightly_rate, availability.currency)} per room/night ·{' '}
              {availability.timezone}
            </p>
          )}
          {(
            [
              'rooms',
              'guests',
              'guest_name',
              'guest_email',
              'guest_phone',
              'advance',
              'payment_reference',
              'notes',
            ] as const
          ).map((k) => (
            <label key={k}>
              {
                {
                  rooms: 'Number of rooms',
                  guests: 'Number of guests',
                  guest_name: 'Guest name',
                  guest_email: 'Guest email',
                  guest_phone: 'Guest phone',
                  advance: 'Recorded booking advance',
                  payment_reference: 'Booking payment reference',
                  notes: 'Booking notes',
                }[k]
              }
              {k === 'notes' ? (
                <textarea
                  maxLength={5000}
                  value={values[k]}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                />
              ) : (
                <input
                  required={['rooms', 'guests', 'guest_name'].includes(k)}
                  type={
                    k === 'rooms' || k === 'guests'
                      ? 'number'
                      : k === 'guest_email'
                        ? 'email'
                        : 'text'
                  }
                  min="1"
                  max={k === 'rooms' ? 1000 : 10000}
                  maxLength={
                    k === 'guest_phone'
                      ? 30
                      : k === 'advance'
                        ? 16
                        : k === 'guest_name'
                          ? 150
                          : k === 'payment_reference'
                            ? 190
                            : 255
                  }
                  inputMode={k === 'advance' ? 'decimal' : undefined}
                  value={values[k]}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
          {availability && total && (
            <p>Quoted total: {formatPrice(total, availability.currency)}</p>
          )}
        </fieldset>
        {uncertain && (
          <p role="alert">
            Outcome uncertain. Retry the unchanged booking with the same request, or inspect
            existing bookings before creating another. Reloading loses this pending request.
          </p>
        )}
        {mutation.error ? <Failure error={mutation.error} /> : null}
        <button className="button primary" disabled={mutation.busy || !availability}>
          {mutation.busy ? 'Saving…' : uncertain ? 'Retry same booking' : 'Save stay booking'}
        </button>
      </form>
    </>
  );
}
export function BookingDetail() {
  const { id = '' } = useParams(),
    api = useStays(),
    { profile } = useAuth(),
    allowed = can(profile, 'stay-bookings.view');
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.get(id, signal) : Promise.resolve(null)),
    [api, id, allowed],
  );
  const result = useResource(id, load);
  if (!allowed) return <p role="alert">You do not have permission to view this booking.</p>;
  return (
    <>
      <Link to="/staff/stay-bookings">← Stay bookings</Link>
      {result.loading ? (
        <p>Loading booking…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry booking</button>
        </>
      ) : result.data ? (
        <BookingContent key={id} initial={result.data} />
      ) : null}
    </>
  );
}
function BookingContent({ initial }: { initial: Booking }) {
  const [booking, setBooking] = useState(initial),
    [reason, setReason] = useState(''),
    [review, setReview] = useState(false),
    [uncertain, setUncertain] = useState(false),
    api = useStays(),
    mutation = useMutation(),
    { profile } = useAuth();
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const today = localStayDate(booking.timezone, clock);
  return (
    <>
      <h1>Stay booking #{booking.id}</h1>
      {(booking.cancellation_requests || []).length > 0 && (
        <section className="staff-panel">
          <h2>Customer cancellation requests</h2>
          {booking.cancellation_requests!.map((r) => (
            <p key={r.id}>
              Request #{r.id}: {label(r.status)} · {r.reason}
              {r.decision_reason && ` · Response: ${r.decision_reason}`}
            </p>
          ))}
          {can(profile, 'stay-bookings') && (
            <Link to={`/staff/stay-cancellation-requests?booking_id=${booking.id}`}>
              Review customer requests
            </Link>
          )}
        </section>
      )}

      <section className="staff-panel">
        <h2>
          {booking.stay_name} — {booking.room_name}
        </h2>
        <BookingSummary booking={booking} />
        <p>
          {booking.guest_name} · {booking.guest_email || 'No email'} ·{' '}
          {booking.guest_phone || 'No phone'}
        </p>
        <p>Payment reference: {booking.payment_reference || 'None recorded'}</p>
        <p className="staff-message">{booking.notes}</p>
        {booking.cancellation_reason && <p>Booking cancellation: {booking.cancellation_reason}</p>}
        <p>
          Advance and balance are records only. Cancellation retains financial history and does not
          initiate a refund.
        </p>
        <button
          disabled={mutation.busy}
          onClick={() => {
            void mutation.run(async () => {
              const latest = await api.get(String(booking.id));
              if (mutation.isActive()) {
                setBooking(latest);
                setReview(false);
                setUncertain(false);
              }
            }, 'Booking refreshed.');
          }}
        >
          Refresh booking
        </button>
      </section>
      <PaymentPanel booking={booking} onUpdate={setBooking} />
      <AttendancePanel
        key={`${booking.checked_in_at}:${booking.checked_out_at}`}
        booking={booking}
        clock={clock}
        onUpdate={setBooking}
      />
      {booking.status === 'confirmed' &&
        !booking.checked_in_at &&
        booking.check_in > today &&
        can(profile, 'stay-bookings.cancel') && (
          <section className="staff-panel">
            {!review ? (
              <button onClick={() => setReview(true)}>Cancel stay booking</button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void mutation.run(async () => {
                    try {
                      const saved = await api.cancel(booking.id, reason);
                      if (mutation.isActive()) {
                        setBooking(saved);
                        setUncertain(false);
                        setReview(false);
                      }
                    } catch (e) {
                      if (mutation.isActive())
                        setUncertain(
                          !(e instanceof StaffError && [401, 403, 404, 422].includes(e.status)),
                        );
                      throw e;
                    }
                  }, 'Booking cancelled.');
                }}
              >
                <h2>Cancel this booking?</h2>
                <label>
                  Booking cancellation reason
                  <textarea
                    required
                    maxLength={1000}
                    disabled={mutation.busy || uncertain}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {uncertain && (
                  <p role="alert">
                    Outcome uncertain. Retry this same cancellation or refresh the booking.
                  </p>
                )}
                <button disabled={mutation.busy}>Yes, cancel stay booking</button>
                <button
                  type="button"
                  disabled={mutation.busy || uncertain}
                  onClick={() => setReview(false)}
                >
                  Keep stay booking
                </button>
              </form>
            )}
          </section>
        )}
      {booking.status === 'confirmed' && booking.check_in <= today && (
        <p>Cancellation is closed on or after the local check-in date.</p>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
      <section className="staff-panel">
        <h2>Booking history</h2>
        <ol className="staff-visit-history">
          {booking.events?.map((e) => (
            <li key={e.id}>
              <strong>{label(e.action)}</strong>
              <p>
                {new Date(e.created_at).toLocaleString()} ·{' '}
                {e.customer_actor_id != null
                  ? `Customer #${e.customer_actor_id}`
                  : e.actor_id != null
                    ? `Staff #${e.actor_id}`
                    : 'Actor unavailable'}
              </p>
              <dl>
                {Object.entries(e.changes).map(([k, v]) => (
                  <div key={k}>
                    <dt>{label(k)}</dt>
                    <dd>
                      {v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

function AttendancePanel({
  booking,
  clock,
  onUpdate,
}: {
  booking: Booking;
  clock: number;
  onUpdate: (b: Booking) => void;
}) {
  const { profile } = useAuth(),
    api = useStays(),
    mutation = useMutation();
  const [action, setAction] = useState<'check-in' | 'check-out' | null>(null),
    [uncertain, setUncertain] = useState(false);
  const shown = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString(undefined, { timeZone: booking.timezone }) : 'Not recorded';
  return (
    <section className="staff-panel">
      <h2>Arrival and departure</h2>
      <p>Current attendance: {label(attendanceStatus(booking))}</p>
      <p>Checked in: {shown(booking.checked_in_at)}</p>
      <p>Checked out: {shown(booking.checked_out_at)}</p>
      <p>Times shown in {booking.timezone}.</p>
      {!action ? (
        <>
          {(['check-in', 'check-out'] as const).map(
            (a) =>
              can(profile, `stay-bookings.${a}`) &&
              canRecordAttendance(booking, a, clock) && (
                <button key={a} onClick={() => setAction(a)}>
                  {a === 'check-in' ? 'Record check-in' : 'Record check-out'}
                </button>
              ),
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void mutation.run(async () => {
              if (!can(profile, `stay-bookings.${action}`)) throw new StaffError(403);
              try {
                const saved = await api.attendance(booking.id, action);
                if (mutation.isActive()) onUpdate(saved);
              } catch (e) {
                if (mutation.isActive())
                  setUncertain(
                    !(e instanceof StaffError && [401, 403, 404, 422].includes(e.status)),
                  );
                throw e;
              }
            }, '');
          }}
        >
          <p>
            {action === 'check-in'
              ? 'Record that the guest has arrived now?'
              : 'Record that the guest has departed now? Early checkout keeps the original room dates, charges and balance; it does not release inventory or issue a refund.'}
          </p>
          {uncertain && (
            <p role="alert">
              Outcome uncertain. Retry this same attendance action or use Refresh booking.
            </p>
          )}
          <button disabled={mutation.busy || !can(profile, `stay-bookings.${action}`)}>
            {mutation.busy
              ? 'Saving…'
              : action === 'check-in'
                ? 'Confirm check-in'
                : 'Confirm check-out'}
          </button>
          <button
            type="button"
            disabled={mutation.busy || uncertain}
            onClick={() => setAction(null)}
          >
            Keep attendance unchanged
          </button>
        </form>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
    </section>
  );
}
