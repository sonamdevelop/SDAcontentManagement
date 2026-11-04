import { useCallback, useState } from 'react';
import { useResource } from '../api/useResource';
import { useMutation } from '../staff/StaffUi';
import { CustomerApi, type Customer } from './api';
import { CustomerFailure } from './CustomerUi';

export function EmailChangePage({ api, customer }: { api: CustomerApi; customer: Customer }) {
  const load = useCallback((signal: AbortSignal) => api.pendingEmailChange(signal), [api]);
  const pending = useResource(String(customer.id), load),
    mutation = useMutation();
  const [passwordKey, setPasswordKey] = useState(0),
    [cancel, setCancel] = useState(false);
  return (
    <>
      <h2>Change customer email</h2>
      <p>
        Current sign-in email: {customer.email}. A new email takes effect only after you explicitly
        confirm its email link. Confirmation signs out all customer devices; staff sessions stay
        separate. Bookings and saved properties keep the same account owner.
      </p>
      <button disabled={mutation.busy} onClick={pending.retry}>
        Refresh email change status
      </button>
      {pending.loading ? (
        <p role="status">Loading email change status…</p>
      ) : pending.error ? (
        <CustomerFailure error={pending.error} />
      ) : pending.data ? (
        <section className="staff-panel">
          <h3>Pending new email</h3>
          <p>
            {pending.data.new_email} · Expires {new Date(pending.data.expires_at).toLocaleString()}
          </p>
          <button disabled={mutation.busy} onClick={() => setCancel(true)}>
            Cancel pending email change
          </button>
        </section>
      ) : (
        <p>No active email change request.</p>
      )}
      <form
        className="staff-panel"
        key={String(cancel)}
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget),
            password = String(data.get('current_password') || ''),
            email = String(data.get('new_email') || '');
          e.currentTarget.reset();
          setPasswordKey((k) => k + 1);
          void mutation.run(
            async () => {
              if (cancel) await api.cancelEmailChange(password);
              else await api.requestEmailChange(email, password);
              if (mutation.isActive()) {
                setCancel(false);
                pending.retry();
              }
            },
            cancel
              ? 'Pending email change cancelled.'
              : 'Confirmation sent to the new email. Your current email is unchanged until you confirm.',
          );
        }}
      >
        <h3>{cancel ? 'Confirm cancellation' : 'Request new email'}</h3>
        <p>
          {cancel
            ? 'This invalidates the pending link without changing your current email.'
            : 'A replacement request invalidates the previous link. Wait at least one minute between requests.'}
        </p>
        <fieldset disabled={mutation.busy}>
          {!cancel && (
            <label>
              New customer email
              <input type="email" name="new_email" autoComplete="email" maxLength={255} required />
            </label>
          )}
          <label>
            Current customer password
            <input
              key={passwordKey}
              type="password"
              name="current_password"
              autoComplete="current-password"
              maxLength={72}
              required
            />
          </label>
          <button>{cancel ? 'Confirm cancel email change' : 'Send new email confirmation'}</button>
          {cancel && (
            <button type="button" onClick={() => setCancel(false)}>
              Keep pending change
            </button>
          )}
        </fieldset>
      </form>
      {mutation.success && <p role="status">{mutation.success}</p>}
      {mutation.error ? <CustomerFailure error={mutation.error} /> : null}
    </>
  );
}
