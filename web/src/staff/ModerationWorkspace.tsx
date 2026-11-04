import { publicApi } from '../api/client';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { formatPrice, label, safePhotoUrl } from '../domain/property';
import { can, StaffError } from './api';
import { useAuth } from './session';
import { Failure, Pagination, useMutation } from './StaffUi';
import {
  ModerationApi,
  moderationFilters,
  type ModerationDetail,
  type ReviewedListing,
} from './moderation';
export function ModerationQueue() {
  const { api, profile } = useAuth(),
    client = useMemo(() => new ModerationApi(api), [api]),
    [params, setParams] = useSearchParams(),
    query = params.toString(),
    allowed = can(profile, 'properties'),
    [error, setError] = useState<unknown>();
  const load = useCallback(
      (signal: AbortSignal) =>
        allowed ? client.list(new URLSearchParams(query), signal) : Promise.resolve(null),
      [client, query, allowed],
    ),
    result = useResource(query, load);
  if (!allowed) return <p role="alert">You do not have permission to view property reviews.</p>;
  return (
    <>
      <h1>Property moderation</h1>
      <p>
        Publication requires an approved review and an available property. Open the current content
        before making a decision.
      </p>
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setParams(
              moderationFilters(
                Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>,
              ),
            );
            setError(undefined);
          } catch (e) {
            setError(e);
          }
        }}
      >
        <label>
          Moderation status
          <select
            aria-label="Moderation status"
            name="status"
            defaultValue={params.get('status') || 'pending'}
          >
            {['pending', 'approved', 'rejected'].map((s) => (
              <option value={s} key={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Moderation property ID
          <input
            name="property_id"
            inputMode="numeric"
            defaultValue={params.get('property_id') || ''}
          />
        </label>
        <button>Filter property reviews</button>
      </form>
      {error ? <Failure error={error} /> : null}
      <button onClick={result.retry}>Refresh property reviews</button>
      {result.loading ? (
        <p>Loading property reviews…</p>
      ) : result.error ? (
        <Failure error={result.error} />
      ) : result.data ? (
        <>
          <div className="staff-grid">
            {result.data.data.map((p) => (
              <article className="staff-panel" key={p.id}>
                <h2>
                  <Link to={`/staff/properties/${p.id}/moderation`}>{p.title}</Link>
                </h2>
                <p>
                  {p.city} · {formatPrice(p.price, p.currency)} · {label(p.status)}
                </p>
                <p>
                  Moderation: {label(p.moderation_status)} · Revision {p.moderation_revision} ·
                  Publication {p.is_published ? 'requested' : 'off'}
                </p>
                {p.moderation_reason && <p>Review reason: {p.moderation_reason}</p>}
              </article>
            ))}
            {!result.data.data.length && <p>No properties match these review filters.</p>}
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
function ListingSnapshot({ listing: p }: { listing: ReviewedListing }) {
  return (
    <>
      <h3>{p.title}</h3>
      <p>
        {label(p.purpose)} · {label(p.property_type)} · {formatPrice(p.price, p.currency)}{' '}
        {p.rent_period && ` / ${p.rent_period}`}
      </p>
      <p>
        {p.area} {p.area_unit} · Bedrooms: {p.bedrooms ?? 'Not specified'} · Bathrooms:{' '}
        {p.bathrooms ?? 'Not specified'}
      </p>
      <p>
        {p.city}, {p.state} · {label(p.status)}
      </p>
      <p>{p.description || 'No description provided.'}</p>
      <div className="photo-gallery">
        {p.photos.map((photo, i) =>
          safePhotoUrl(photo, publicApi.baseUrl) ? (
            <img
              key={photo}
              src={safePhotoUrl(photo, publicApi.baseUrl)!}
              alt={`Review photo ${i + 1} for ${p.title}`}
            />
          ) : null,
        )}
      </div>
    </>
  );
}
export function ModerationPage() {
  const { id = '' } = useParams(),
    { api, profile } = useAuth(),
    client = useMemo(() => new ModerationApi(api), [api]),
    allowed = can(profile, 'properties'),
    valid = /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
  const load = useCallback(
      (signal: AbortSignal) =>
        allowed && valid ? client.get(Number(id), signal) : Promise.resolve(null),
      [client, id, allowed, valid],
    ),
    result = useResource(id, load);
  if (!allowed) return <p role="alert">You do not have permission to view this review.</p>;
  if (!valid) return <p role="alert">Invalid property ID.</p>;
  return (
    <>
      <Link to="/staff/property-moderation">Back to property reviews</Link>
      {result.loading ? (
        <p>Loading listing for review…</p>
      ) : result.error ? (
        <>
          <Failure error={result.error} />
          <button onClick={result.retry}>Retry listing review</button>
        </>
      ) : result.data ? (
        <ModerationContent
          key={`${id}:${result.data.moderation_revision}`}
          initial={result.data}
          client={client}
          onRefresh={result.retry}
          moderator={can(profile, 'properties.moderate')}
          editor={can(profile, 'properties.edit')}
        />
      ) : null}
    </>
  );
}
function ModerationContent({
  initial,
  client,
  onRefresh,
  moderator,
  editor,
}: {
  initial: ModerationDetail;
  client: ModerationApi;
  onRefresh: () => void;
  moderator: boolean;
  editor: boolean;
}) {
  const [data, setData] = useState(initial),
    [decision, setDecision] = useState<'approved' | 'rejected'>('approved'),
    [reason, setReason] = useState(''),
    [review, setReview] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [blocked, setBlocked] = useState(false),
    mutation = useMutation();
  const submitting = data.moderation_status === 'rejected',
    writable = data.moderation_status === 'pending' ? moderator : submitting && editor;
  async function save() {
    const wasUncertain = uncertain,
      body = { expected_revision: data.moderation_revision, reason: reason.trim() };
    await mutation.run(async () => {
      try {
        const saved = submitting
          ? await client.submit(data.id, body)
          : await client.decide(data.id, { ...body, decision });
        if (mutation.isActive()) {
          setData(saved);
          setReview(false);
          setUncertain(false);
          setReason('');
        }
      } catch (e) {
        if (
          !wasUncertain &&
          e instanceof StaffError &&
          [401, 403, 404, 409, 422, 429].includes(e.status)
        ) {
          setReview(false);
          setBlocked(true);
        } else setUncertain(true);
        throw e;
      }
    }, 'Review state saved.');
  }
  return (
    <>
      <h1>Property review #{data.id}</h1>
      <p>
        Moderation: {label(data.moderation_status)} · Revision {data.moderation_revision}
      </p>
      <p>
        Publication {data.is_published ? 'requested' : 'off'} · Enquiries{' '}
        {data.accepts_enquiries ? 'enabled' : 'disabled'}. Only approved, published and available
        listings from active staff appear publicly.
      </p>
      {data.moderation_reason && <p>Review reason: {data.moderation_reason}</p>}
      <section className="staff-panel" aria-label="Current listing content">
        <h2>Current public content</h2>
        <ListingSnapshot listing={data.listing} />
      </section>
      <button disabled={mutation.busy} onClick={onRefresh}>
        Refresh listing review
      </button>
      {editor && (
        <p>
          <Link to={`/staff/properties/${data.id}/edit`}>Edit listing content</Link>
        </p>
      )}
      {writable && !review && !blocked && (
        <form
          className="staff-panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim()) setReview(true);
          }}
        >
          {!submitting && (
            <label>
              Moderation decision
              <select
                aria-label="Moderation decision"
                value={decision}
                onChange={(e) => setDecision(e.target.value as 'approved' | 'rejected')}
              >
                <option value="approved">Approve listing</option>
                <option value="rejected">Reject listing</option>
              </select>
            </label>
          )}
          <label>
            {submitting ? 'Resubmission note' : 'Moderation reason'}
            <textarea
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button>{submitting ? 'Review resubmission' : 'Review moderation decision'}</button>
        </form>
      )}
      {review && (
        <section className="staff-panel" aria-label="Review moderation action">
          <h2>Confirm this review</h2>
          <p>
            Property #{data.id} · Revision {data.moderation_revision} · {data.listing.title}
          </p>
          <p>
            {submitting
              ? 'Resubmit for a fresh review. The listing remains hidden.'
              : decision === 'approved'
                ? 'Approve this exact content revision. Publication still requires its publication toggle, available status and active staff.'
                : 'Reject this content revision. It will remain hidden from the public catalogue and enquiries.'}
          </p>
          <p>Reason: {reason.trim()}</p>
          <button disabled={mutation.busy} onClick={() => void save()}>
            {uncertain ? 'Retry same moderation action' : 'Confirm moderation action'}
          </button>
          {!uncertain && (
            <button disabled={mutation.busy} onClick={() => setReview(false)}>
              Edit moderation action
            </button>
          )}
        </section>
      )}
      {uncertain && (
        <p role="alert">
          Response uncertain. Retry the same action or refresh to inspect the current review state.
        </p>
      )}
      {blocked && (
        <p>
          Refresh this listing before another action. Older staff sessions must sign out and sign in
          again for review access.
        </p>
      )}
      {mutation.error ? <Failure error={mutation.error} /> : null}
      {mutation.success && <p role="status">{mutation.success}</p>}
      <section className="staff-panel">
        <h2>Moderation history</h2>
        {data.history.map((e) => (
          <article key={e.id}>
            <h3>
              Revision {e.revision}: {label(e.action)}
            </h3>
            <p>
              {e.created_at} ·{' '}
              {e.actor_id === null ? 'System / legacy record' : `Staff #${e.actor_id}`}
            </p>
            <p>{e.reason}</p>
            {e.snapshot && (
              <details>
                <summary>View reviewed content snapshot</summary>
                <ListingSnapshot listing={e.snapshot} />
              </details>
            )}
          </article>
        ))}
      </section>
    </>
  );
}
