import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label, PROPERTY_TYPES, safePhotoUrl } from '../domain/property';
import {
  AdminProperty,
  can,
  Enquiry,
  isAdminProperty,
  Lead,
  Overview,
  Page,
  Profile,
  propertyForm,
  StaffApi,
  StaffError,
} from './api';
import { Auth, useAuth } from './session';
import { LeadPage, FollowUpQueue } from './LeadWorkspace';
import { formatLeadValue } from './leads';
import './staff.css';
const STORAGE = 'sda.staff.token';
function savedToken() {
  try {
    return sessionStorage.getItem(STORAGE) || '';
  } catch {
    return '';
  }
}
function storeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(STORAGE, token);
    else sessionStorage.removeItem(STORAGE);
  } catch {
    /* Memory-only session when storage is unavailable. */
  }
}
function ErrorMessage({ error }: { error: unknown }) {
  return (
    <p role="alert">
      {error instanceof Error
        ? error.message
        : 'Request failed. Check your connection and try again.'}
    </p>
  );
}
export function StaffApp() {
  const [token, setToken] = useState(savedToken);
  const clear = useCallback(() => {
    storeToken('');
    setToken('');
  }, []);
  const api = useMemo(() => new StaffApi(token, clear), [token, clear]);
  const location = useLocation();
  const load = useCallback(
    (signal: AbortSignal) => (token ? api.me(signal) : Promise.resolve(null)),
    [api, token],
  );
  const session = useResource(token, load);
  const [refreshed, setRefreshed] = useState<{ token: string; profile: Profile } | null>(null);
  // Refresh ACL in the background: returning from a photo picker must not erase a draft.
  useEffect(() => {
    const controller = new AbortController();
    const focus = () => {
      if (token)
        api
          .me(controller.signal)
          .then((profile) => {
            if (!controller.signal.aborted) setRefreshed({ token, profile });
          })
          .catch(() => {
            /* API requests still enforce permissions; 401 clears the session. */
          });
    };
    window.addEventListener('focus', focus);
    return () => {
      controller.abort();
      window.removeEventListener('focus', focus);
    };
  }, [token, api]);
  if (token && session.loading)
    return (
      <div className="staff container">
        <p role="status">Checking staff session…</p>
      </div>
    );
  if (token && session.error)
    return (
      <div className="staff container">
        <ErrorMessage error={session.error} />
        <button onClick={session.retry}>Retry session check</button>
        <button onClick={clear}>Clear this session</button>
      </div>
    );
  if (!token || !session.data)
    return (
      <Login
        onLogin={(next) => {
          storeToken(next);
          setToken(next);
        }}
      />
    );
  return (
    <Auth.Provider
      value={{ api, profile: refreshed?.token === token ? refreshed.profile : session.data, clear }}
    >
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="login" element={<Navigate to="/staff" replace />} />
          <Route path="properties" element={<PropertyList />} />
          <Route path="properties/new" element={<PropertyEditor />} />
          <Route path="properties/:id/edit" element={<PropertyEditor key={location.pathname} />} />
          <Route path="enquiries" element={<Records kind="enquiries" />} />
          <Route path="leads" element={<Records kind="leads" />} />
          <Route path="leads/:id" element={<LeadPage />} />
          <Route path="follow-ups" element={<FollowUpQueue />} />
          <Route
            path="*"
            element={
              <p>
                Staff page not found. <Link to="/staff">Dashboard</Link>
              </p>
            }
          />
        </Route>
      </Routes>
    </Auth.Provider>
  );
}
function Login({ onLogin }: { onLogin: (token: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError(undefined);
    try {
      const body = await new StaffApi().request<{ data: { access_token: string } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: fields.get('email'),
          password: fields.get('password'),
          device_name: 'SDA staff website',
        }),
      });
      if (!body.data?.access_token) throw new StaffError(502);
      if (mounted.current) onLogin(body.data.access_token);
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <main className="staff container">
      <Link to="/properties">← Public website</Link>
      <form className="staff-login" onSubmit={submit}>
        <p className="eyebrow">SDA workspace</p>
        <h1>Staff sign in</h1>
        <p>Use your Laravel staff account.</p>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" maxLength={255} required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={1024}
            required
          />
        </label>
        {error ? <ErrorMessage error={error} /> : null}
        <button className="button primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
function Shell() {
  const { api, profile, clear } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  async function logout() {
    setBusy(true);
    setError(undefined);
    try {
      await api.request('/auth/logout', { method: 'POST' });
      clear();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="staff">
      <header className="staff-header">
        <Link to="/staff" className="staff-brand">
          SDA <span>Workspace</span>
        </Link>
        <span>
          {profile.name} · {profile.role.name}
        </span>
        <button onClick={logout} disabled={busy}>
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </header>
      <div className="staff-layout">
        <nav aria-label="Staff navigation">
          <NavLink end to="/staff">
            Overview
          </NavLink>
          {[
            ['properties', 'Properties'],
            ['properties.enquiries', 'Enquiries'],
            ['leads', 'Leads'],
          ].map(
            ([permission, title]) =>
              can(profile, permission) && (
                <NavLink key={permission} to={`/staff/${title.toLowerCase()}`}>
                  {title}
                </NavLink>
              ),
          )}
          {can(profile, 'properties.create') && (
            <NavLink to="/staff/properties/new">Add property</NavLink>
          )}
          {can(profile, 'leads.view') && <NavLink to="/staff/follow-ups">Follow-ups</NavLink>}
          <Link to="/properties">Public website ↗</Link>
        </nav>
        <main>
          {error ? <ErrorMessage error={error} /> : null}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function Denied() {
  return <p role="alert">You do not have permission to view this page.</p>;
}
function Dashboard() {
  const { api, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const from = params.get('from') || '',
    to = params.get('to') || '';
  const permitted = can(profile, 'property-reports');
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  const load = useCallback(
    (signal: AbortSignal) =>
      permitted
        ? api.request<Overview>(`/admin/reports/overview?${query}`, { signal })
        : Promise.resolve(null),
    [api, permitted, query.toString()],
  );
  const result = useResource(query.toString(), load);
  return (
    <>
      <h1>Overview</h1>
      {!permitted ? (
        <Denied />
      ) : (
        <>
          <p>
            Counts reflect records visible to your account. These are current statuses, not revenue
            totals.
          </p>
          <form
            className="staff-filters"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setParams({ from: String(f.get('from')), to: String(f.get('to')) });
            }}
          >
            <label>
              From
              <input name="from" type="date" defaultValue={from} />
            </label>
            <label>
              To
              <input name="to" type="date" defaultValue={to} />
            </label>
            <button>Apply dates</button>
          </form>
          {result.loading ? (
            <p role="status">Loading overview…</p>
          ) : result.error ? (
            <>
              <ErrorMessage error={result.error} />
              <button onClick={result.retry}>Retry</button>
            </>
          ) : result.data ? (
            <>
              <div className="staff-metrics">
                {Object.entries(result.data.data).map(([section, counts]) => (
                  <section className="staff-panel" key={section}>
                    <h2>{label(section)}</h2>
                    {counts === null ? (
                      <p>Not available for your account</p>
                    ) : (
                      <dl>
                        {Object.entries(counts).map(([key, n]) => (
                          <div key={key}>
                            <dt>{label(key)}</dt>
                            <dd>{n}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </section>
                ))}
              </div>
              <p>
                Updated {result.data.meta.as_of} · {result.data.meta.period.timezone}
              </p>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
function Paging({ meta, onPage }: { meta: Page<unknown>['meta']; onPage: (n: number) => void }) {
  return (
    <div className="staff-paging">
      <button disabled={meta.current_page <= 1} onClick={() => onPage(meta.current_page - 1)}>
        Previous
      </button>
      <span>
        Page {meta.current_page} of {meta.last_page} · {meta.total} records
      </span>
      <button
        disabled={meta.current_page >= meta.last_page}
        onClick={() => onPage(meta.current_page + 1)}
      >
        Next
      </button>
    </div>
  );
}
function useList<T>(kind: string, permission: string, validate?: (value: unknown) => boolean) {
  const { api, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const allowed = can(profile, permission);
  const query = params.toString();
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!allowed) return null;
      const body = await api.request<Page<T>>(`/admin/${kind}?${query}`, { signal });
      if (
        !Array.isArray(body.data) ||
        !body.meta ||
        !Number.isSafeInteger(body.meta.current_page) ||
        body.meta.current_page < 1 ||
        !Number.isSafeInteger(body.meta.last_page) ||
        body.meta.last_page < 1 ||
        !Number.isSafeInteger(body.meta.total) ||
        body.meta.total < 0 ||
        (validate && !body.data.every(validate))
      )
        throw new StaffError(502);
      return body;
    },
    [api, allowed, kind, query, validate],
  );
  const result = useResource(kind + query, load);
  return { result, allowed, params, setParams };
}
function PropertyList() {
  const { profile } = useAuth();
  const { result, allowed, params, setParams } = useList<AdminProperty>(
    'properties',
    'properties',
    isAdminProperty,
  );
  if (!allowed) return <Denied />;
  return (
    <>
      <div className="staff-title">
        <h1>Properties</h1>
        {can(profile, 'properties.create') && (
          <Link className="button primary" to="/staff/properties/new">
            Add property
          </Link>
        )}
      </div>
      <form
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setParams(Object.fromEntries(Array.from(f.entries()).map(([k, v]) => [k, String(v)])));
        }}
      >
        <label>
          Search properties
          <input name="q" defaultValue={params.get('q') || ''} />
        </label>
        <label>
          Status
          <select name="status" defaultValue={params.get('status') || ''}>
            <option value="">All statuses</option>
            {['available', 'reserved', 'sold', 'rented', 'unavailable'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <button>Search</button>
      </form>
      {result.loading ? (
        <p role="status">Loading properties…</p>
      ) : result.error ? (
        <>
          <ErrorMessage error={result.error} />
          <button onClick={result.retry}>Retry</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((p) => (
              <article className="staff-panel" key={p.id}>
                <h2>{p.title}</h2>
                <p>
                  {p.city} · {formatPrice(p.price, p.currency)} · {label(p.status)}
                </p>
                <p>
                  {p.is_published ? 'Published' : 'Unpublished'} · Enquiries{' '}
                  {p.accepts_enquiries ? 'enabled' : 'disabled'}
                </p>
                {can(profile, 'properties.edit') && (
                  <Link to={`/staff/properties/${p.id}/edit`}>Edit property</Link>
                )}
              </article>
            ))}
            {!result.data.data.length && <p>No properties found.</p>}
          </div>
          <Paging
            meta={result.data.meta}
            onPage={(n) => {
              const next = new URLSearchParams(params);
              next.set('page', String(n));
              setParams(next);
            }}
          />
        </>
      ) : null}
    </>
  );
}
function Records({ kind }: { kind: 'enquiries' | 'leads' }) {
  const { profile } = useAuth();
  const { result, allowed, params, setParams } = useList<Enquiry | Lead>(
    kind,
    kind === 'enquiries' ? 'properties.enquiries' : 'leads',
  );
  if (!allowed) return <Denied />;
  return (
    <>
      <h1>{label(kind)}</h1>
      <p>Only records visible to your staff account are shown.</p>
      {result.loading ? (
        <p role="status">Loading {kind}…</p>
      ) : result.error ? (
        <>
          <ErrorMessage error={result.error} />
          <button onClick={result.retry}>Retry</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((row) => (
              <article className="staff-panel" key={row.id}>
                {'property_title' in row ? (
                  <>
                    <h2>{row.property_title}</h2>
                    <p>
                      {row.name} · {row.email}
                      {row.phone ? ` · ${row.phone}` : ''}
                    </p>
                    <p className="staff-message">{row.message}</p>
                    <p>
                      {row.lead_id ? (
                        can(profile, 'leads.view') ? (
                          <Link to={`/staff/leads/${row.lead_id}`}>Open lead #{row.lead_id}</Link>
                        ) : (
                          `Linked lead #${row.lead_id}`
                        )
                      ) : (
                        'No linked lead'
                      )}{' '}
                      · {row.created_at}
                    </p>
                  </>
                ) : (
                  <>
                    <h2>
                      {can(profile, 'leads.view') ? (
                        <Link to={`/staff/leads/${row.id}`}>{row.title}</Link>
                      ) : (
                        row.title
                      )}
                    </h2>
                    <p>{formatLeadValue(row.lead_value, row.currency)}</p>
                    <p>
                      {row.stage?.name || 'No stage'} · {row.agent?.name || 'Unassigned'}
                    </p>
                  </>
                )}
              </article>
            ))}
            {!result.data.data.length && <p>No {kind} found.</p>}
          </div>
          <Paging
            meta={result.data.meta}
            onPage={(n) => {
              const next = new URLSearchParams(params);
              next.set('page', String(n));
              setParams(next);
            }}
          />
        </>
      ) : null}
    </>
  );
}
const initial: Record<string, string> = {
  title: '',
  description: '',
  purpose: 'sale',
  property_type: 'apartment',
  price: '',
  rent_period: 'monthly',
  area: '',
  area_unit: 'sqft',
  bedrooms: '',
  bathrooms: '',
  address: '',
  city: '',
  state: '',
  postal_code: '',
  owner_name: '',
  owner_phone: '',
  status: 'available',
};
function PropertyEditor() {
  const { id } = useParams();
  const { api, profile } = useAuth();
  const permitted =
    can(profile, id ? 'properties.edit' : 'properties.create') &&
    (!id || can(profile, 'properties'));
  const load = useCallback(
    (signal: AbortSignal) => (id && permitted ? api.property(id, signal) : Promise.resolve(null)),
    [api, id, permitted],
  );
  const result = useResource(id || 'new', load);
  if (!permitted) return <Denied />;
  if (id && result.loading) return <p role="status">Loading property…</p>;
  if (result.error)
    return (
      <>
        <ErrorMessage error={result.error} />
        <button onClick={result.retry}>Retry</button>
      </>
    );
  return <PropertyFields key={id || 'new'} property={result.data} id={id} />;
}
function PropertyFields({ property, id }: { property: AdminProperty | null; id?: string }) {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      Object.keys(initial).map((k) => [
        k,
        property ? String((property as unknown as Record<string, unknown>)[k] ?? '') : initial[k],
      ]),
    ),
  );
  const [published, setPublished] = useState(property?.is_published ?? false);
  const [enquiries, setEnquiries] = useState(property?.accepts_enquiries ?? false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      if (photos.length + (property?.image_paths.length || 0) - removed.length > 10)
        throw new StaffError(422, { photos: ['Keep at most 10 photos.'] });
      await api.save(propertyForm(values, published, enquiries, photos, removed), id);
      if (mounted.current) navigate('/staff/properties');
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const fields = error instanceof StaffError ? error.fields : {};
  function field(
    name: string,
    title: string,
    options?: readonly string[],
    type = 'text',
    required = true,
  ) {
    return (
      <label key={name}>
        {title}
        {required ? ' *' : ''}
        {options ? (
          <select
            aria-invalid={!!fields[name]}
            value={values[name]}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          >
            {options.map((x) => (
              <option key={x} value={x}>
                {label(x)}
              </option>
            ))}
          </select>
        ) : name === 'description' ? (
          <textarea
            value={values[name]}
            maxLength={10000}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          />
        ) : (
          <input
            required={required}
            type={type}
            step={['price', 'area'].includes(name) ? '0.01' : undefined}
            min={name === 'area' ? '0.01' : type === 'number' ? '0' : undefined}
            max={
              ['bedrooms', 'bathrooms'].includes(name)
                ? 100
                : name === 'price'
                  ? '9999999999999.99'
                  : name === 'area'
                    ? '9999999999.99'
                    : undefined
            }
            maxLength={
              name === 'title' || name === 'owner_name'
                ? 255
                : name === 'address'
                  ? 500
                  : name === 'postal_code'
                    ? 20
                    : name === 'owner_phone'
                      ? 30
                      : 100
            }
            aria-invalid={!!fields[name]}
            value={values[name]}
            onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
          />
        )}
      </label>
    );
  }
  const status =
    values.purpose === 'rent'
      ? ['available', 'rented', 'unavailable']
      : ['available', 'sold', 'unavailable'];
  if (property?.status === 'reserved') status.push('reserved');
  return (
    <>
      <Link to="/staff/properties">← Properties</Link>
      <h1>{id ? 'Edit property' : 'Add property'}</h1>
      <p>
        Publishing controls website visibility. Enquiries require both publication and an available
        property.
      </p>
      <form className="staff-property-form" onSubmit={submit}>
        <fieldset disabled={busy}>
          <legend>Property details</legend>
          <div className="staff-form-grid">
            {field('title', 'Title')}
            {field('purpose', 'Purpose', ['sale', 'rent'])}
            {field('property_type', 'Property type', PROPERTY_TYPES)}
            {field('price', 'Price (INR)', undefined, 'number')}
            {values.purpose === 'rent' &&
              field('rent_period', 'Rent period', ['daily', 'monthly', 'yearly'])}
            {field('area', 'Area', undefined, 'number')}
            {field('area_unit', 'Area unit', ['sqft', 'sqm', 'acre'])}
            {field('bedrooms', 'Bedrooms', undefined, 'number', false)}
            {field('bathrooms', 'Bathrooms', undefined, 'number', false)}
            {field('status', 'Status', status)}
            {field('address', 'Address')}
            {field('city', 'City')}
            {field('state', 'State')}
            {field('postal_code', 'Postal code', undefined, 'text', false)}
            {field('owner_name', 'Owner name')}
            {field('owner_phone', 'Owner phone', undefined, 'tel', false)}
            {field('description', 'Description', undefined, 'text', false)}
          </div>
          <p>
            Reserved status and deal-related changes are controlled by Laravel. Save errors explain
            any restrictions.
          </p>
          <label className="staff-check">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Published on website
          </label>
          <label className="staff-check">
            <input
              type="checkbox"
              checked={enquiries}
              onChange={(e) => setEnquiries(e.target.checked)}
            />
            Accept enquiries
          </label>
          <h2>Photos</h2>
          <p>Up to 10 JPEG, PNG or WebP photos, 5 MB each. Photos are public.</p>
          <div className="staff-photos">
            {property?.image_paths.map((path, i) => (
              <label key={path}>
                {property.photos[i] && safePhotoUrl(property.photos[i], window.location.origin) && (
                  <img
                    src={safePhotoUrl(property.photos[i], window.location.origin)!}
                    alt={`Property photo ${i + 1}`}
                  />
                )}
                <span>
                  <input
                    type="checkbox"
                    checked={removed.includes(path)}
                    onChange={(e) =>
                      setRemoved((v) =>
                        e.target.checked ? [...v, path] : v.filter((x) => x !== path),
                      )
                    }
                  />
                  Remove photo {i + 1}
                </span>
              </label>
            ))}
          </div>
          <label>
            Add photos
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setPhotos(Array.from(e.target.files || []))}
            />
          </label>
          {error ? <ErrorMessage error={error} /> : null}
          {Object.entries(fields).map(([name, messages]) => (
            <p role="alert" key={name}>
              <strong>{label(name)}:</strong> {messages.join(' ')}
            </p>
          ))}
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save property'}
          </button>
        </fieldset>
      </form>
    </>
  );
}
