import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { popularityFilters } from '../domain/favourites';
import { label } from '../domain/property';
import { can } from './api';
import { useAuth } from './session';
import { VisitApi } from './visits';
import { Failure, Pagination } from './StaffUi';
type Popularity = {
  id: number;
  title: string;
  city: string;
  status: string;
  moderation_status: string;
  is_published: boolean;
  favourites_count: number;
};
function isPopularity(v: unknown): v is Popularity {
  if (!v || typeof v !== 'object') return false;
  const r = v as Popularity;
  return (
    Number.isSafeInteger(r.id) &&
    r.id > 0 &&
    Number.isSafeInteger(r.favourites_count) &&
    r.favourites_count > 0 &&
    typeof r.title === 'string' &&
    typeof r.city === 'string' &&
    typeof r.status === 'string' &&
    ['pending', 'approved', 'rejected'].includes(r.moderation_status) &&
    typeof r.is_published === 'boolean'
  );
}
export function PopularityPage() {
  const { api, profile } = useAuth(),
    [params, setParams] = useSearchParams(),
    query = params.toString(),
    allowed = can(profile, 'properties'),
    [error, setError] = useState<unknown>();
  const load = useCallback(
      (signal: AbortSignal) =>
        allowed
          ? new VisitApi(api).page('/admin/property-favourites?' + query, isPopularity, signal)
          : Promise.resolve(null),
      [api, query, allowed],
    ),
    result = useResource(query, load);
  if (!allowed) return <p role="alert">You do not have permission to view property popularity.</p>;
  return (
    <>
      <h1>Property popularity</h1>
      <p>
        Current saved-property counts from active customer accounts. Counts show interest, not
        enquiries or sales; customer identities are not included.
      </p>
      <form
        className="staff-filters"
        key={query}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setParams(
              popularityFilters(
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
          Popularity property ID
          <input
            name="property_id"
            inputMode="numeric"
            defaultValue={params.get('property_id') || ''}
          />
        </label>
        <label>
          Minimum saved count
          <input
            name="min_count"
            type="number"
            min="1"
            max="1000000000"
            step="1"
            defaultValue={params.get('min_count') || '1'}
          />
        </label>
        <button>Filter property popularity</button>
      </form>
      {error ? <Failure error={error} /> : null}
      <button onClick={result.retry}>Refresh property popularity</button>
      {result.loading ? (
        <p>Loading property popularity…</p>
      ) : result.error ? (
        <Failure error={result.error} />
      ) : result.data ? (
        <>
          <div className="staff-grid">
            {result.data.data.map((p) => (
              <article className="staff-panel" key={p.id}>
                <h2>{p.title}</h2>
                <p>
                  {p.city} · {label(p.status)} · Moderation: {label(p.moderation_status)}
                </p>
                <p>
                  Saved by {p.favourites_count}{' '}
                  {p.favourites_count === 1 ? 'customer' : 'customers'}
                </p>
                <Link to={`/staff/properties/${p.id}/moderation`}>View listing review</Link>
              </article>
            ))}
            {!result.data.data.length && <p>No properties match these popularity filters.</p>}
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
