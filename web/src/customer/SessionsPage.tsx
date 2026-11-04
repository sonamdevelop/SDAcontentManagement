import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { Pagination, useMutation } from '../staff/StaffUi';
import { CustomerApi } from './api';
import { CustomerFailure } from './CustomerUi';
import type { CustomerSession } from './sessions';

export function CustomerSessionsPage({ api }: { api: CustomerApi }) {
  const [params, setParams] = useSearchParams(),
    page = Number(params.get('page') || '1');
  const load = useCallback((signal: AbortSignal) => api.sessions(page, signal), [api, page]);
  const result = useResource(String(page), load);
  const [selected, setSelected] = useState<CustomerSession | 'others' | null>(null);
  const [notice, setNotice] = useState('');
  return (
    <>
      <h2>Customer device sessions</h2>
      <p>
        These are active sign-ins to your customer account. Device labels are supplied during
        sign-in and may repeat; they are not verified device identities. No IP address or location
        is collected here.
      </p>
      <button
        onClick={() => {
          setSelected(null);
          result.retry();
        }}
      >
        Refresh device sessions
      </button>
      <button
        onClick={() => {
          setNotice('');
          setSelected('others');
        }}
      >
        Sign out other devices
      </button>
      {notice && <p role="status">{notice}</p>}
      {selected && (
        <SessionConfirmation
          key={selected === 'others' ? 'others' : selected.id}
          api={api}
          target={selected}
          onCancel={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            setNotice('Device sign-out confirmed. This customer session is still signed in.');
            result.retry();
          }}
        />
      )}
      {result.loading ? (
        <p role="status">Loading device sessions…</p>
      ) : result.error ? (
        <CustomerFailure error={result.error} />
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((r) => (
              <article key={r.id} className="staff-panel">
                <h3>
                  {r.device_name || 'Unnamed device'}
                  {r.is_current ? ' · This device' : ''}
                </h3>
                <p>Signed in: {new Date(r.created_at).toLocaleString()}</p>
                <p>
                  Last activity:{' '}
                  {r.last_used_at ? new Date(r.last_used_at).toLocaleString() : 'Not recorded'}
                </p>
                <p>
                  Expires:{' '}
                  {r.expires_at ? new Date(r.expires_at).toLocaleString() : 'No scheduled expiry'}
                </p>
                {!r.is_current && (
                  <button
                    onClick={() => {
                      setNotice('');
                      setSelected(r);
                    }}
                  >
                    Sign out device {r.device_name || r.id}
                  </button>
                )}
              </article>
            ))}
            {!result.data.data.length && <p>No active sessions on this page.</p>}
          </div>
          <Pagination
            meta={result.data.meta}
            onPage={(p) => {
              setSelected(null);
              setParams({ page: String(p) });
            }}
          />
        </>
      ) : null}
    </>
  );
}
function SessionConfirmation({
  api,
  target,
  onCancel,
  onDone,
}: {
  api: CustomerApi;
  target: CustomerSession | 'others';
  onCancel: () => void;
  onDone: () => void;
}) {
  const mutation = useMutation(),
    all = target === 'others';
  const [passwordKey, setPasswordKey] = useState(0);
  return (
    <form
      className="staff-panel"
      onSubmit={(e) => {
        e.preventDefault();
        const password = String(new FormData(e.currentTarget).get('current_password') || '');
        e.currentTarget.reset();
        setPasswordKey((key) => key + 1);
        void mutation.run(async () => {
          await api.revokeSession(all ? 'others' : target.id, password);
          if (mutation.isActive()) onDone();
        }, '');
      }}
    >
      <h3>
        {all
          ? 'Confirm sign out other devices'
          : `Confirm sign out ${target.device_name || 'device'}`}
      </h3>
      <p>
        {all
          ? 'End all other customer sign-ins, including sessions not shown on this page.'
          : 'End this customer sign-in. A device can sign in again with your password.'}{' '}
        Your current device stays signed in. If you suspect unauthorized access, also change your
        password.
      </p>
      <fieldset disabled={mutation.busy}>
        <label>
          Confirm current customer password
          <input
            key={passwordKey}
            type="password"
            name="current_password"
            autoComplete="current-password"
            required
            maxLength={72}
          />
        </label>
        <button>{all ? 'Confirm sign out other devices' : 'Confirm sign out device'}</button>
        <button type="button" onClick={onCancel}>
          Cancel device sign-out
        </button>
      </fieldset>
      {mutation.error ? <CustomerFailure error={mutation.error} /> : null}
    </form>
  );
}
