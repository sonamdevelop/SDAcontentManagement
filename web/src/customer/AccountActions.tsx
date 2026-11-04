import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '../staff/StaffUi';
import { CustomerApi, saveCustomerToken, type Customer } from './api';
import { CustomerFailure } from './CustomerUi';
export function VerificationPanel({
  api,
  customer,
  onRefresh,
}: {
  api: CustomerApi;
  customer: Customer;
  onRefresh: () => void;
}) {
  const mutation = useMutation();
  return (
    <section className="stay-card">
      <h3>Email verification</h3>
      <p>
        {customer.email_verified_at
          ? 'Email verified.'
          : 'Email not verified. Verify your email before making a new reservation.'}
      </p>
      {!customer.email_verified_at && (
        <button
          disabled={mutation.busy}
          onClick={() =>
            void mutation.run(async () => {
              await api.requestVerification();
            }, 'If eligible, a verification link has been sent. Check your inbox; wait a minute before requesting another.')
          }
        >
          Send verification email
        </button>
      )}
      {mutation.success && <p role="status">{mutation.success}</p>}
      {mutation.error ? <CustomerFailure error={mutation.error} /> : null}
      <button onClick={onRefresh}>Refresh account status</button>
    </section>
  );
}
export function AccountActions({ kind }: { kind: 'forgot' | 'reset' | 'verify' | 'change-email' }) {
  const location = useLocation(),
    navigate = useNavigate(),
    mutation = useMutation(),
    [done, setDone] = useState(false),
    [link] = useState(() => new URLSearchParams(location.hash.slice(1))),
    api = new CustomerApi();
  const email = link.get('email') || '',
    token = link.get('token') || '',
    customerId = link.get('customer_id') || '',
    valid =
      /^[a-f0-9]{64}$/.test(token) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      (kind !== 'change-email' ||
        (/^[1-9]\d*$/.test(customerId) && Number.isSafeInteger(Number(customerId))));
  // Consume fragments into memory before any API call; never place secrets in URLs or storage again.
  useEffect(() => {
    if (location.hash) navigate(location.pathname + location.search, { replace: true });
  }, []);
  const title =
    kind === 'change-email'
      ? 'Confirm customer email change'
      : kind === 'forgot'
        ? 'Recover customer password'
        : kind === 'reset'
          ? 'Reset customer password'
          : 'Verify customer email';
  return (
    <div className="account-shell">
      <h1>{title}</h1>
      <Link to="/account">Back to customer account</Link>
      {done ? (
        <p role="status">
          {kind === 'change-email'
            ? 'Email changed and verified. Sign in again with your new email. All previous customer sessions have ended.'
            : kind === 'forgot'
              ? 'If the account is eligible, a reset link will be sent. Check your inbox.'
              : kind === 'verify'
                ? 'Email verified. Return to your account to refresh its status.'
                : 'Password reset. Sign in again with your new password.'}
        </p>
      ) : kind !== 'forgot' && !valid ? (
        <p>
          This email link is incomplete. Request a new link from your account or password recovery.
        </p>
      ) : (
        <form
          className="staff-panel"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            void mutation.run(async () => {
              if (kind === 'forgot') await api.forgotPassword(String(form.get('email') || ''));
              else if (kind === 'change-email') {
                await api.completeEmailChange({ customer_id: Number(customerId), email, token });
                saveCustomerToken('');
              } else if (kind === 'verify') await api.verifyEmail({ email, token });
              else {
                await api.resetPassword({
                  email,
                  token,
                  password: String(form.get('password') || ''),
                  password_confirmation: String(form.get('password_confirmation') || ''),
                });
                saveCustomerToken('');
              }
              if (mutation.isActive()) setDone(true);
            }, '');
          }}
        >
          <fieldset disabled={mutation.busy}>
            {kind === 'forgot' ? (
              <label>
                Recovery email
                <input name="email" type="email" required maxLength={255} autoComplete="email" />
              </label>
            ) : (
              <p>Account email: {email}</p>
            )}
            {kind === 'change-email' && (
              <p>
                Confirm only if you requested this new email. All customer sessions and earlier
                account-action links will be invalidated. Your bookings and saved properties remain
                linked to the same account.
              </p>
            )}
            {kind === 'reset' && (
              <>
                <p>
                  Use at least 12 characters with uppercase/lowercase letters and a number. All
                  customer sessions will be signed out.
                </p>
                <label>
                  New recovery password
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
                  Confirm recovery password
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
              {mutation.busy
                ? 'Please wait…'
                : kind === 'change-email'
                  ? 'Confirm customer email change'
                  : kind === 'forgot'
                    ? 'Send password reset email'
                    : kind === 'verify'
                      ? 'Confirm email verification'
                      : 'Save recovered password'}
            </button>
          </fieldset>
        </form>
      )}
      {mutation.error ? (
        <>
          <CustomerFailure error={mutation.error} />
          {kind === 'change-email' ? (
            <Link to="/account/email">Request a new email change</Link>
          ) : kind === 'verify' ? (
            <Link to="/account">Request a new verification email</Link>
          ) : (
            <Link to="/account/forgot">Request a new reset link</Link>
          )}
        </>
      ) : null}
    </div>
  );
}
