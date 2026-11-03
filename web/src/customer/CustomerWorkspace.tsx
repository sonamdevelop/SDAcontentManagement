import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label } from '../domain/property';
import { Pagination, useMutation } from '../staff/StaffUi';
import {
  CustomerApi,
  CustomerError,
  saveCustomerToken,
  storedCustomerToken,
  type Customer,
  type CustomerBooking,
} from './api';
function Failure({ error }: { error: unknown }) {
  return (
    <div role="alert">
      <p>
        {error instanceof Error
          ? error.message
          : 'Could not confirm the request. Please try again.'}
      </p>
      {error instanceof CustomerError &&
        Object.entries(error.fields).map(([key, messages]) => (
          <p key={key}>
            {key}: {messages.join(' ')}
          </p>
        ))}
    </div>
  );
}
export function CustomerWorkspace() {
  const [token, setToken] = useState(storedCustomerToken),
    [notice, setNotice] = useState('');
  const currentToken = useRef(token);
  currentToken.current = token;
  const clear = useCallback((message: string) => {
    currentToken.current = '';
    saveCustomerToken('');
    setToken('');
    setNotice(message);
  }, []);
  const api = useMemo(
    () =>
      new CustomerApi(token, () => {
        // A late response from an old session must not clear a newer account's token.
        if (currentToken.current === token)
          clear('Your customer session ended. Please sign in again.');
      }),
    [token, clear],
  );
  const load = useCallback(
    (signal: AbortSignal) => (token ? api.me(signal) : Promise.resolve(null)),
    [api, token],
  );
  const result = useResource(token, load);
  const mutation = useMutation();
  useEffect(() => {
    if (result.error instanceof CustomerError && [401, 403].includes(result.error.status))
      clear('Your customer session ended. Please sign in again.');
  }, [result.error, clear]);
  if (!token)
    return (
      <div className="account-shell">
        <h1>Customer account</h1>
        {notice && <p role="status">{notice}</p>}
        <CustomerLogin
          onToken={(value) => {
            currentToken.current = value;
            saveCustomerToken(value);
            setToken(value);
            setNotice('');
          }}
        />
      </div>
    );
  if (result.loading)
    return (
      <div className="account-shell">
        <p role="status">Checking customer session…</p>
      </div>
    );
  if (result.error)
    return (
      <div className="account-shell">
        <Failure error={result.error} />
        <button onClick={result.retry}>Retry customer session</button>
        <button
          onClick={() => clear('Signed out on this browser. Server sign-out was not confirmed.')}
        >
          Clear customer session
        </button>
      </div>
    );
  if (!result.data) return null;
  return (
    <div className="account-shell">
      <h1>My customer account</h1>
      <p>Signed in as {result.data.name}</p>
      <nav className="statement-controls" aria-label="Customer account navigation">
        <NavLink end to="/account">
          My profile
        </NavLink>
        <NavLink to="/account/bookings">My bookings</NavLink>
        <NavLink to="/account/password">Change password</NavLink>
        <button
          disabled={mutation.busy}
          onClick={() =>
            void mutation.run(async () => {
              await api.logout();
              clear('Signed out.');
            }, '')
          }
        >
          Sign out customer
        </button>
      </nav>
      {mutation.error ? <Failure error={mutation.error} /> : null}
      <Routes>
        <Route
          index
          element={<ProfilePage api={api} customer={result.data} onSaved={result.retry} />}
        />
        <Route
          path="password"
          element={
            <PasswordPage
              api={api}
              onChanged={() => clear('Password changed. Sign in with your new password.')}
            />
          }
        />
        <Route path="bookings" element={<MyBookings api={api} />} />
        <Route path="bookings/:id" element={<MyBooking api={api} />} />
        <Route path="*" element={<Link to="/account">Go to my account</Link>} />
      </Routes>
    </div>
  );
}
function CustomerLogin({ onToken }: { onToken: (token: string) => void }) {
  const [register, setRegister] = useState(false),
    mutation = useMutation(),
    api = useMemo(() => new CustomerApi(), []);
  return (
    <>
      <div className="statement-controls">
        <button aria-pressed={!register} onClick={() => setRegister(false)}>
          Customer sign in
        </button>
        <button aria-pressed={register} onClick={() => setRegister(true)}>
          Create customer account
        </button>
      </div>
      <form
        key={String(register)}
        className="staff-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<
            string,
            string
          >;
          void mutation.run(async () => {
            const token = await api.authenticate(register ? 'register' : 'login', values);
            if (mutation.isActive()) onToken(token);
          }, '');
        }}
      >
        <h2>{register ? 'Create customer account' : 'Customer sign in'}</h2>
        <fieldset disabled={mutation.busy}>
          {register && (
            <label>
              Customer name
              <input name="name" required maxLength={150} autoComplete="name" />
            </label>
          )}
          <label>
            Customer email
            <input name="email" type="email" required maxLength={255} autoComplete="username" />
          </label>
          <label>
            Customer password
            <input
              name="password"
              type="password"
              required
              minLength={register ? 12 : undefined}
              maxLength={72}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
          </label>
          {register && (
            <>
              <p>Use at least 12 characters with uppercase/lowercase letters and a number.</p>
              <label>
                Confirm customer password
                <input
                  name="password_confirmation"
                  type="password"
                  required
                  minLength={12}
                  maxLength={72}
                  autoComplete="new-password"
                />
              </label>
            </>
          )}
          <button>
            {mutation.busy ? 'Please wait…' : register ? 'Register customer' : 'Sign in customer'}
          </button>
        </fieldset>
        {mutation.error ? <Failure error={mutation.error} /> : null}
      </form>
    </>
  );
}
function ProfilePage({
  api,
  customer,
  onSaved,
}: {
  api: CustomerApi;
  customer: Customer;
  onSaved: () => void;
}) {
  const mutation = useMutation();
  return (
    <>
      <h2>My profile</h2>
      <p>Account email: {customer.email}. Email cannot be changed here.</p>
      <form
        key={`${customer.name}:${customer.phone}`}
        className="staff-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void mutation.run(async () => {
            await api.profile({
              name: String(f.get('name') || ''),
              phone: String(f.get('phone') || ''),
            });
            if (mutation.isActive()) onSaved();
          }, '');
        }}
      >
        <fieldset disabled={mutation.busy}>
          <label>
            Profile name
            <input
              name="name"
              required
              maxLength={150}
              autoComplete="name"
              defaultValue={customer.name}
            />
          </label>
          <label>
            Profile phone
            <input
              name="phone"
              type="tel"
              maxLength={30}
              autoComplete="tel"
              defaultValue={customer.phone || ''}
            />
          </label>
          <button>Save customer profile</button>
        </fieldset>
        {mutation.error ? <Failure error={mutation.error} /> : null}
      </form>
    </>
  );
}
function PasswordPage({ api, onChanged }: { api: CustomerApi; onChanged: () => void }) {
  const mutation = useMutation();
  return (
    <>
      <h2>Change customer password</h2>
      <p>A successful change signs out all customer sessions. Staff sessions are separate.</p>
      <form
        className="staff-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget)) as Record<
            string,
            string
          >;
          void mutation.run(async () => {
            await api.password(values);
            onChanged();
          }, '');
        }}
      >
        <fieldset disabled={mutation.busy}>
          <label>
            Current customer password
            <input
              name="current_password"
              type="password"
              required
              maxLength={72}
              autoComplete="current-password"
            />
          </label>
          <label>
            New customer password
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirm new customer password
            <input
              name="password_confirmation"
              type="password"
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>
          <p>Use at least 12 characters with uppercase/lowercase letters and a number.</p>
          <button>Update customer password</button>
        </fieldset>
        {mutation.error ? <Failure error={mutation.error} /> : null}
      </form>
    </>
  );
}
function BookingSummary({ booking: b }: { booking: CustomerBooking }) {
  return (
    <>
      <p>
        {b.check_in} → {b.check_out} · {b.timezone} · {b.rooms} rooms · {b.guests} guests
      </p>
      <p>
        Booking: {label(b.status)} · Attendance: {label(b.attendance_status || 'not_arrived')}
      </p>
      <p>
        Booked total: {formatPrice(b.total, b.currency)} · Amount due:{' '}
        {formatPrice(b.amount_due, b.currency)}
      </p>
      <p>
        Net paid: {formatPrice(b.net_paid, b.currency)} · Outstanding:{' '}
        {formatPrice(b.balance, b.currency)} · Refund due: {formatPrice(b.refund_due, b.currency)}
      </p>
    </>
  );
}
function MyBookings({ api }: { api: CustomerApi }) {
  const [params, setParams] = useSearchParams(),
    query = params.toString(),
    load = useCallback(
      (signal: AbortSignal) => api.bookings(new URLSearchParams(query), signal),
      [api, query],
    ),
    result = useResource(query, load);
  return (
    <>
      <h2>My bookings</h2>
      <form
        key={query}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const status = String(new FormData(e.currentTarget).get('status') || '');
          setParams(status ? { status } : {});
        }}
      >
        <label>
          My booking status
          <select
            aria-label="My booking status"
            name="status"
            defaultValue={params.get('status') || ''}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button>Filter my bookings</button>
      </form>
      {result.loading ? (
        <p role="status">Loading my bookings…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry my bookings</button>
        </>
      ) : result.data ? (
        <>
          <button onClick={result.retry}>Refresh my bookings</button>
          {result.data.data.map((b) => (
            <article className="stay-card" key={b.id}>
              <h3>
                <Link to={`/account/bookings/${b.id}`}>
                  {b.stay_name} — {b.room_name} #{b.id}
                </Link>
              </h3>
              <BookingSummary booking={b} />
            </article>
          ))}
          {!result.data.data.length && (
            <p>
              No bookings are linked to your account yet. For an existing booking, contact the stay
              team.
            </p>
          )}
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
      <p>
        Online reservation creation is not available yet. <Link to="/stays">Explore stays</Link>.
      </p>
    </>
  );
}
function MyBooking({ api }: { api: CustomerApi }) {
  const { id = '' } = useParams(),
    load = useCallback((signal: AbortSignal) => api.booking(id, signal), [api, id]),
    result = useResource(id, load);
  return (
    <>
      <Link to="/account/bookings">Back to my bookings</Link>
      {result.loading ? (
        <p role="status">Loading my booking…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry my booking</button>
        </>
      ) : result.data ? (
        <article className="stay-card">
          <h2>My booking #{result.data.id}</h2>
          <h3>
            {result.data.stay_name} — {result.data.room_name}
          </h3>
          <p>Guest: {result.data.guest_name}</p>
          <BookingSummary booking={result.data} />
          <button onClick={result.retry}>Refresh my booking</button>
        </article>
      ) : null}
    </>
  );
}
