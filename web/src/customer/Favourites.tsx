import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice } from '../domain/property';
import { Pagination, useMutation } from '../staff/StaffUi';
import { CustomerApi, CustomerError, saveCustomerToken, storedCustomerToken } from './api';
import { CustomerFailure } from './CustomerUi';
function FavouriteFailure({ error }: { error: unknown }) {
  return error instanceof CustomerError && error.status === 404 ? (
    <p role="alert">This property is currently unavailable.</p>
  ) : (
    <CustomerFailure error={error} />
  );
}
function FavouriteControl({
  api,
  id,
  initialSaved,
  onChanged,
}: {
  api: CustomerApi;
  id: number;
  initialSaved: boolean;
  onChanged?: () => void;
}) {
  const [saved, setSaved] = useState(initialSaved),
    [pending, setPending] = useState<boolean | null>(null),
    mutation = useMutation();
  async function change() {
    const target = pending ?? !saved,
      wasUncertain = pending !== null;
    await mutation.run(async () => {
      try {
        await api.setFavourite(id, target);
        if (mutation.isActive()) {
          setSaved(target);
          setPending(null);
          onChanged?.();
        }
      } catch (e) {
        if (
          wasUncertain ||
          !(e instanceof CustomerError) ||
          ![401, 403, 404, 409, 422, 429].includes(e.status)
        )
          setPending(target);
        throw e;
      }
    }, 'Saved property updated.');
  }
  return (
    <>
      <button disabled={mutation.busy} onClick={() => void change()}>
        {mutation.busy
          ? 'Updating saved property…'
          : pending !== null
            ? pending
              ? 'Retry saving property'
              : 'Retry removing property'
            : saved
              ? 'Remove saved property'
              : 'Save property'}
      </button>
      {pending !== null && (
        <p role="alert">
          Response uncertain. Retry the same action or refresh your saved properties to check the
          current state.
        </p>
      )}
      {mutation.error ? <FavouriteFailure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
    </>
  );
}
export function SavePropertyButton({ id }: { id: number }) {
  const [token, setToken] = useState(storedCustomerToken),
    navigate = useNavigate(),
    api = useMemo(
      () =>
        new CustomerApi(token, () => {
          if (storedCustomerToken() === token) {
            saveCustomerToken('');
            setToken('');
          }
        }),
      [token],
    );
  const load = useCallback(
      (signal: AbortSignal) => (token ? api.favouriteStatus(id, signal) : Promise.resolve(null)),
      [api, id, token],
    ),
    result = useResource(String(id) + ':' + token, load);
  if (!token)
    return (
      <p>
        <Link to="/account">Sign in to save this property</Link>
      </p>
    );
  return (
    <section className="stay-card" aria-label="Save property to customer account">
      {result.loading ? (
        <p>Checking saved status…</p>
      ) : result.error ? (
        <>
          <FavouriteFailure error={result.error} />
          {result.error instanceof CustomerError && [401, 403].includes(result.error.status) && (
            <button
              onClick={() => {
                saveCustomerToken('');
                setToken('');
                navigate('/account');
              }}
            >
              Sign in again for saved properties
            </button>
          )}
        </>
      ) : result.data ? (
        <FavouriteControl api={api} id={id} initialSaved={result.data.saved} />
      ) : null}
      <button onClick={result.retry}>Refresh saved status</button>
      <p>
        <Link to="/account/favourites">My saved properties</Link>
      </p>
    </section>
  );
}
export function MyFavourites({ api, onReauth }: { api: CustomerApi; onReauth: () => void }) {
  const [params, setParams] = useSearchParams(),
    query = params.toString(),
    load = useCallback(
      (signal: AbortSignal) => api.favourites(new URLSearchParams(query), signal),
      [api, query],
    ),
    result = useResource(query, load);
  return (
    <>
      <h2>My saved properties</h2>
      <p>
        Available listings show current public details. Unavailable listings remain removable
        without showing their private or unreviewed content.
      </p>
      <Link to="/properties">Explore properties</Link>
      <button onClick={result.retry}>Refresh saved properties</button>
      {result.loading ? (
        <p>Loading saved properties…</p>
      ) : result.error ? (
        <>
          <FavouriteFailure error={result.error} />
          {result.error instanceof CustomerError && result.error.status === 403 && (
            <button onClick={onReauth}>Sign in again for saved properties</button>
          )}
        </>
      ) : result.data ? (
        <>
          <div className="staff-grid">
            {result.data.data.map((row) => (
              <article className="stay-card" key={row.property_id}>
                {row.property ? (
                  <>
                    <h3>
                      <Link to={`/properties/${row.property_id}`}>{row.property.title}</Link>
                    </h3>
                    <p>
                      {row.property.city} · {formatPrice(row.property.price, row.property.currency)}
                    </p>
                  </>
                ) : (
                  <>
                    <h3>Saved property #{row.property_id}</h3>
                    <p>This saved property is currently unavailable.</p>
                  </>
                )}
                <p>Saved: {row.saved_at}</p>
                <FavouriteControl
                  api={api}
                  id={row.property_id}
                  initialSaved
                  onChanged={result.retry}
                />
              </article>
            ))}
          </div>
          {!result.data.data.length && <p>You have no saved properties yet.</p>}
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
