import { useCallback, useEffect } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useResource } from '../api/useResource';
import { ApiError, publicApi } from '../api/client';
import { stayCatalogue, type StayContent } from '../api/stay-catalogue';
import { formatPrice, safePhotoUrl } from '../domain/property';
function Gallery({ content }: { content: StayContent }) {
  return (
    <div className="stay-gallery">
      {content.photos.length ? (
        content.photos.map((p, i) => (
          <img
            key={p}
            src={safePhotoUrl(p, publicApi.baseUrl)!}
            alt={`${content.name} photo ${i + 1}`}
            loading="lazy"
          />
        ))
      ) : (
        <p>Photos coming soon</p>
      )}
    </div>
  );
}
function Copy({ content }: { content: StayContent }) {
  return (
    <>
      <p className="stay-copy">{content.description || 'Details coming soon.'}</p>
      {!!content.amenities.length && (
        <>
          <h3>Amenities</h3>
          <ul>
            {content.amenities.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {content.rules && (
        <>
          <h3>Stay rules</h3>
          <p className="stay-copy">{content.rules}</p>
        </>
      )}
    </>
  );
}
function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div role="alert">
      <p>
        {error instanceof ApiError && error.status === 404
          ? 'This stay is not available.'
          : 'Could not load stays. Please try again.'}
      </p>
      <button onClick={retry}>Retry stays</button>
    </div>
  );
}
export function StaysPage() {
  const [params, setParams] = useSearchParams(),
    query = params.toString();
  const load = useCallback(
    (signal: AbortSignal) => stayCatalogue.list(new URLSearchParams(query), signal),
    [query],
  );
  const result = useResource(query, load);
  useEffect(() => {
    document.title = 'Stays in Dandeli';
  }, []);
  return (
    <div className="container detail-page">
      <h1>Explore stays</h1>
      <p>
        Discover published stays and room types. Rates are per room per night; date-based
        availability and online booking are not offered here yet.
      </p>
      <form
        key={query}
        className="staff-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const city = String(new FormData(e.currentTarget).get('city') || '').trim();
          setParams(city ? { city } : {});
        }}
      >
        <label>
          Stay city
          <input name="city" maxLength={100} defaultValue={params.get('city') || ''} />
        </label>
        <button>Filter stays</button>
        <Link to="/stays">Clear stay filters</Link>
      </form>
      {result.loading ? (
        <p role="status">Loading stays…</p>
      ) : result.error ? (
        <ErrorState error={result.error} retry={result.retry} />
      ) : result.data ? (
        <>
          <div className="stay-grid">
            {result.data.data.map((s) => (
              <article className="stay-card" key={s.id}>
                <Gallery content={{ ...s, photos: s.photos.slice(0, 1) }} />
                <h2>
                  <Link to={`/stays/${s.id}`} state={{ staySearch: '?' + query }}>
                    {s.name}
                  </Link>
                </h2>
                <p>
                  {s.city} · {s.room_types_count} room types
                </p>
                <p>From {formatPrice(s.from_rate, s.currency)} per room per night</p>
                <p>{s.description.slice(0, 240)}</p>
              </article>
            ))}
          </div>
          {!result.data.data.length && <p>No published stays match your filters.</p>}
          <div className="staff-paging">
            <button
              disabled={result.data.meta.current_page <= 1}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(result.data!.meta.current_page - 1));
                setParams(next);
              }}
            >
              Previous stays
            </button>
            <span>
              Page {result.data.meta.current_page} of {result.data.meta.last_page}
            </span>
            <button
              disabled={result.data.meta.current_page >= result.data.meta.last_page}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('page', String(result.data!.meta.current_page + 1));
                setParams(next);
              }}
            >
              Next stays
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
export function StayDetailPage() {
  const { id = '' } = useParams(),
    location = useLocation();
  const load = useCallback((signal: AbortSignal) => stayCatalogue.detail(id, signal), [id]);
  const result = useResource(id, load);
  const search = location.state?.staySearch,
    back = '/stays' + (typeof search === 'string' && search.startsWith('?') ? search : '');
  useEffect(() => {
    document.title = result.data ? `${result.data.name} | Stays in Dandeli` : 'Stay details';
  }, [result.data]);
  return (
    <div className="container detail-page">
      <Link to={back}>Back to stays</Link>
      {result.loading ? (
        <p role="status">Loading stay details…</p>
      ) : result.error ? (
        <ErrorState error={result.error} retry={result.retry} />
      ) : result.data ? (
        <>
          <h1>{result.data.name}</h1>
          <p>
            {result.data.city} · {result.data.timezone}
          </p>
          <Gallery content={result.data} />
          <Copy content={result.data} />
          <h2>Room types</h2>
          {result.data.rooms!.map((r) => (
            <article className="stay-card" key={r.id}>
              <h3>{r.name}</h3>
              <p>
                {formatPrice(r.nightly_rate, result.data!.currency)} per room per night · Up to{' '}
                {r.capacity} guests per room
              </p>
              <Gallery content={r} />
              <Copy content={r} />
            </article>
          ))}
          <p>
            Room rates shown are current flat nightly rates. Availability and booking must be
            confirmed separately; this page does not reserve rooms or collect payments.
          </p>
        </>
      ) : null}
    </div>
  );
}
