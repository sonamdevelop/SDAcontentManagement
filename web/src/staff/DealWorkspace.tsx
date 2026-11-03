import { useCallback, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label } from '../domain/property';
import { can, StaffError } from './api';
import {
  DealApi,
  DEAL_STATUSES,
  dealWriteAllowed,
  reservationPayload,
  ReservationRequest,
  type Deal,
  type DealSummary,
} from './deals';
import { dueTimestamp, localDateInput } from './leads';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
import { Picker } from './VisitWorkspace';
import type { Choice } from './visits';
function useDeals() {
  const { api } = useAuth();
  return useMemo(() => new DealApi(api), [api]);
}
const time = (v: string | null) => (v ? new Date(v).toLocaleString() : '—');
function Amounts({ deal }: { deal: DealSummary }) {
  return (
    <>
      <p>Agreed total: {formatPrice(deal.agreed_price, deal.currency)}</p>
      <p>Recorded advance: {formatPrice(deal.booking_amount, deal.currency)}</p>
    </>
  );
}
export function DealList() {
  const { profile } = useAuth(),
    api = useDeals();
  const [params, setParams] = useSearchParams(),
    query = params.toString();
  const allowed = can(profile, 'deals');
  const load = useCallback(
    (signal: AbortSignal) =>
      allowed ? api.list(new URLSearchParams(query), signal) : Promise.resolve(null),
    [api, allowed, query],
  );
  const result = useResource(query, load),
    [error, setError] = useState<unknown>();
  if (!allowed) return <p role="alert">You do not have permission to view deals.</p>;
  return (
    <>
      <div className="staff-title">
        <h1>Property deals</h1>
        {dealWriteAllowed(profile, 'create') && (
          <Link to="/staff/property-deals/new" className="button primary">
            Reserve property
          </Link>
        )}
      </div>
      <p>
        Reservations, recorded advances and final outcomes. Only records visible to your account are
        listed.
      </p>
      <form
        key={query}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          setError(undefined);
          try {
            const form = new FormData(e.currentTarget),
              next = new URLSearchParams();
            for (const key of ['status', 'purpose', 'property_id', 'lead_id', 'user_id']) {
              const v = String(form.get(key) || '').trim();
              if (v) {
                if (key.endsWith('_id') && !/^[1-9]\d*$/.test(v))
                  throw new Error('Filter IDs must be positive integers.');
                next.set(key, v);
              }
            }
            for (const key of ['from', 'to']) {
              const v = String(form.get(key) || '');
              if (v) next.set(key, dueTimestamp(v));
            }
            if (
              next.has('from') &&
              next.has('to') &&
              Date.parse(next.get('to')!) < Date.parse(next.get('from')!)
            )
              throw new Error('The filter end must be after its start.');
            setParams(next);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <label>
          Deal status
          <select name="status" defaultValue={params.get('status') || ''}>
            <option value="">All statuses</option>
            {DEAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Purpose
          <select name="purpose" defaultValue={params.get('purpose') || ''}>
            <option value="">All purposes</option>
            <option value="sale">Sale</option>
            <option value="rent">Rent</option>
          </select>
        </label>
        {['property_id', 'lead_id', 'user_id'].map((k) => (
          <label key={k}>
            {label(k)}
            <input name={k} inputMode="numeric" defaultValue={params.get(k) || ''} />
          </label>
        ))}
        {['from', 'to'].map((k) => (
          <label key={k}>
            Created {k}
            <input
              type="datetime-local"
              step="1"
              name={k}
              defaultValue={localDateInput(params.get(k))}
            />
          </label>
        ))}
        <button>Filter deals</button>
        <Link to="/staff/property-deals">Clear filters</Link>
      </form>
      <p>Dates shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      {error ? <Failure error={error} /> : null}
      {result.loading ? (
        <p role="status">Loading deals…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry deals</button>
        </>
      ) : result.data ? (
        <>
          <div className="staff-records">
            {result.data.data.map((d) => (
              <article className="staff-panel" key={d.id}>
                <h2>
                  {can(profile, 'deals.view') ? (
                    <Link to={`/staff/property-deals/${d.id}`}>{d.property_title}</Link>
                  ) : (
                    d.property_title
                  )}
                </h2>
                <p>
                  #{d.id} · {label(d.status)} · {label(d.purpose)} · {d.property_city}
                </p>
                <Amounts deal={d} />
                <p>Created {time(d.created_at)}</p>
              </article>
            ))}
            {!result.data.data.length && <p>No matching deals.</p>}
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
export function DealCreate() {
  const { profile } = useAuth(),
    api = useDeals(),
    navigate = useNavigate(),
    mutation = useMutation();
  const [property, setProperty] = useState<Choice | null>(null),
    [lead, setLead] = useState<Choice | null>(null);
  const [values, setValues] = useState({
    agreed_price: '',
    booking_amount: '0.00',
    payment_reference: '',
    notes: '',
  });
  const request = useRef(new ReservationRequest()),
    [uncertain, setUncertain] = useState(false);
  if (!dealWriteAllowed(profile, 'create'))
    return (
      <p role="alert">
        Reservation needs deal creation/view, property list/edit and lead list/detail permissions.
      </p>
    );
  function submit(e: FormEvent) {
    e.preventDefault();
    void mutation.run(async () => {
      if (!dealWriteAllowed(profile, 'create')) throw new StaffError(403);
      const payload = request.current.prepare(
        reservationPayload({ ...values, property_id: property?.id || 0, lead_id: lead?.id || 0 }),
      );
      try {
        const saved = await api.reserve(payload);
        request.current.resolved();
        if (mutation.isActive()) navigate(`/staff/property-deals/${saved.id}`);
      } catch (e) {
        if (mutation.isActive()) {
          if (e instanceof StaffError && [401, 403, 404, 422].includes(e.status)) {
            request.current.resolved();
            setUncertain(false);
          } else setUncertain(true);
        }
        throw e;
      }
    }, '');
  }
  return (
    <>
      <Link to="/staff/property-deals">← Property deals</Link>
      <h1>Reserve property</h1>
      <p>
        Choose an available property and an open lead with a customer. Agreed total is the full
        negotiated commitment, including for rentals.
      </p>
      <p>
        The advance is included in that total. Recording it does not collect payment or verify a
        receipt. Amounts cannot be edited after reservation.
      </p>
      <form onSubmit={submit}>
        <fieldset className="staff-visit-fieldset" disabled={mutation.busy || uncertain}>
          <div className="staff-visit-choices">
            <Picker kind="properties" value={property} onChange={setProperty} />
            <Picker kind="leads" value={lead} onChange={setLead} />
          </div>
          {(['agreed_price', 'booking_amount', 'payment_reference', 'notes'] as const).map((k) => (
            <label key={k}>
              {
                {
                  agreed_price: 'Agreed total',
                  booking_amount: 'Recorded advance',
                  payment_reference: 'Payment reference',
                  notes: 'Deal notes',
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
                  required={k === 'agreed_price'}
                  inputMode={k.endsWith('price') || k.endsWith('amount') ? 'decimal' : 'text'}
                  maxLength={k === 'payment_reference' ? 190 : 16}
                  value={values[k]}
                  onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                />
              )}
            </label>
          ))}
        </fieldset>
        {uncertain && (
          <p role="alert">
            Reservation outcome is uncertain. Retry the unchanged request to retrieve its result, or
            check the deals list before starting another reservation. Do not create a duplicate.
          </p>
        )}
        {mutation.error ? <Failure error={mutation.error} /> : null}
        <button className="button primary" disabled={mutation.busy}>
          {mutation.busy ? 'Reserving…' : uncertain ? 'Retry same reservation' : 'Save reservation'}
        </button>
      </form>
    </>
  );
}
export function DealDetail() {
  const { id = '' } = useParams(),
    { profile } = useAuth(),
    api = useDeals(),
    allowed = can(profile, 'deals.view');
  const load = useCallback(
    (signal: AbortSignal) => (allowed ? api.detail(id, signal) : Promise.resolve(null)),
    [api, id, allowed],
  );
  const result = useResource(id, load);
  if (!allowed) return <p role="alert">You do not have permission to view this deal.</p>;
  return (
    <>
      <Link to="/staff/property-deals">← Property deals</Link>
      {result.loading ? (
        <p role="status">Loading deal…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry deal</button>
        </>
      ) : result.data ? (
        <DealContent key={id} initial={result.data} />
      ) : null}
    </>
  );
}
function DealContent({ initial }: { initial: Deal }) {
  const [deal, setDeal] = useState(initial),
    [action, setAction] = useState<'confirm' | 'cancel' | null>(null),
    [reason, setReason] = useState(''),
    [uncertain, setUncertain] = useState(false);
  const api = useDeals(),
    { profile } = useAuth(),
    mutation = useMutation();
  return (
    <>
      <h1>{deal.property_title}</h1>
      <section className="staff-panel">
        <h2>Deal #{deal.id}</h2>
        <button
          disabled={mutation.busy}
          onClick={() => {
            void mutation.run(async () => {
              const latest = await api.detail(String(deal.id));
              if (mutation.isActive()) {
                setDeal(latest);
                setAction(null);
                setUncertain(false);
              }
            }, 'Deal refreshed.');
          }}
        >
          Refresh deal
        </button>
        <p>
          {label(deal.status)} · {label(deal.purpose)}
          {deal.rent_period ? ` · ${label(deal.rent_period)}` : ''} · {deal.property_city}
        </p>
        <Amounts deal={deal} />
        <p>
          {deal.customer_name} · {deal.customer_email || 'No email'} ·{' '}
          {deal.customer_phone || 'No phone'}
        </p>
        <p>Payment reference: {deal.payment_reference || 'None recorded'}</p>
        <p className="staff-message">{deal.notes || 'No deal notes'}</p>
        <p>
          Created {time(deal.created_at)} · Confirmed {time(deal.confirmed_at)} · Cancelled{' '}
          {time(deal.cancelled_at)}
        </p>
        <p>
          Agent #{deal.user_id ?? 'unassigned'} · Created by #{deal.created_by ?? 'unknown'}
        </p>
        {deal.cancellation_reason && <p>Cancellation: {deal.cancellation_reason}</p>}
        {deal.lead_id && can(profile, 'leads.view') && (
          <Link to={`/staff/leads/${deal.lead_id}`}>Open linked lead</Link>
        )}
        <p>
          Advance records do not verify payment. Cancellation does not initiate a refund.
          Confirmation is final and does not update the lead stage.
        </p>
      </section>
      {deal.status === 'reserved' && (
        <section className="staff-panel">
          <h2>Reservation outcome</h2>
          {!action ? (
            <>
              {dealWriteAllowed(profile, 'confirm') && (
                <button onClick={() => setAction('confirm')}>Confirm deal</button>
              )}{' '}
              {dealWriteAllowed(profile, 'cancel') && (
                <button onClick={() => setAction('cancel')}>Cancel reservation</button>
              )}
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutation.run(async () => {
                  try {
                    if (!dealWriteAllowed(profile, action)) throw new StaffError(403);
                    const saved = await api.transition(deal.id, action, reason);
                    if (mutation.isActive()) {
                      setDeal(saved);
                      setAction(null);
                      setUncertain(false);
                    }
                  } catch (e) {
                    if (mutation.isActive())
                      setUncertain(
                        !(e instanceof StaffError && [403, 404, 422].includes(e.status)),
                      );
                    throw e;
                  }
                }, 'Deal outcome saved.');
              }}
            >
              <p>
                {action === 'confirm'
                  ? `Confirm this ${deal.purpose}? The property will become ${deal.purpose === 'sale' ? 'sold' : 'rented'}. This cannot be reversed.`
                  : 'Cancel this hold and release the property when eligible? The recorded advance remains in history; arrange any refund separately.'}
              </p>
              {action === 'cancel' && (
                <label>
                  Cancellation reason
                  <textarea
                    required
                    maxLength={1000}
                    disabled={mutation.busy || uncertain}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              )}
              {uncertain && (
                <p role="alert">
                  Outcome uncertain. Retry this same action or refresh the deal before choosing
                  another action.
                </p>
              )}
              <button disabled={mutation.busy || !dealWriteAllowed(profile, action)}>
                {mutation.busy
                  ? 'Saving…'
                  : action === 'confirm'
                    ? 'Yes, confirm deal'
                    : 'Yes, cancel reservation'}
              </button>{' '}
              <button
                type="button"
                disabled={mutation.busy || uncertain}
                onClick={() => setAction(null)}
              >
                Keep reservation
              </button>
            </form>
          )}
        </section>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
      <section className="staff-panel">
        <h2>Deal history</h2>
        <ol className="staff-visit-history">
          {deal.events.map((event) => (
            <li key={event.id}>
              <strong>{label(event.action)}</strong>
              <p>
                {time(event.created_at)} · Staff #{event.actor_id ?? 'unknown'}
              </p>
              <dl>
                {Object.entries(event.changes).map(([key, value]) => (
                  <div key={key}>
                    <dt>{label(key)}</dt>
                    <dd>
                      {value === null
                        ? '—'
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>
        {!deal.events.length && <p>No deal history yet.</p>}
      </section>
    </>
  );
}
