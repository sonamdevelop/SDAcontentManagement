import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, publicApi } from '../api/client';
import { useResource } from '../api/useResource';
import { filterError, filterParams, readFilters, type Filters } from '../domain/filters';
import { PropertyCard } from '../components/PropertyCard';
import { FilterForm } from '../components/FilterForm';
import { Icon } from '../components/Icon';
export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const filters = useMemo(() => readFilters(new URLSearchParams(query)), [query]);
  const error = filterError(filters);
  const load = useCallback(
    (signal: AbortSignal) =>
      error ? Promise.reject(new ApiError(422)) : publicApi.list(filters, signal),
    [filters, error],
  );
  const result = useResource(query, load);
  useEffect(() => {
    document.title = 'Properties for sale & rent | Stay in Dandeli';
  }, []);
  const apply = (next: Filters) => {
    const nextParams = filterParams(next);
    if (nextParams.toString() === query) result.retry();
    else setParams(nextParams);
    document.getElementById('listings')?.scrollIntoView?.({ block: 'start' });
  };
  return (
    <>
      <section className="catalog-hero">
        <div className="container hero-content">
          <p className="eyebrow light">BUY · RENT · BELONG</p>
          <h1>
            Find a place.
            <br />
            <em>Make it yours.</em>
          </h1>
          <p className="hero-copy">
            A home to settle into. A space to grow.
            <br />
            Discover properties for sale and rent, all in one place.
          </p>
          <a href="#listings" className="hero-link">
            Find your next property <Icon name="arrow" />
          </a>
        </div>
      </section>
      <section
        className="catalog-section container"
        aria-labelledby="catalog-heading"
        id="listings"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR NEXT CHAPTER</p>
            <h2 id="catalog-heading">A place for every plan.</h2>
          </div>
          <p>
            Explore the details. Picture the possibilities.
            <br />
            Get in touch when a place feels right.
          </p>
        </div>
        <FilterForm filters={filters} apply={apply} />
        {error && (
          <p className="notice" role="alert">
            {error} Update the price filters to continue.
          </p>
        )}
        <div aria-live="polite" aria-busy={result.loading}>
          {result.loading && (
            <>
              <p className="result-count" role="status">
                Loading properties…
              </p>
              <div className="property-grid" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <div className="skeleton-card" key={n}>
                    <div />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            </>
          )}
          {!result.loading && !!result.error && !error && (
            <div className="empty-state" role="alert">
              <Icon name="house" />
              <h3>We couldn’t load the properties.</h3>
              <p>Please check your connection and try again.</p>
              <button className="button primary" onClick={result.retry}>
                Try again
              </button>
            </div>
          )}
          {!result.loading &&
            result.data &&
            (result.data.data.length ? (
              <>
                <p className="result-count">
                  {result.data.meta.total}{' '}
                  {result.data.meta.total === 1 ? 'property' : 'properties'} found
                </p>
                <div className="property-grid">
                  {result.data.data.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-state">
                <Icon name="house" />
                <h3>
                  {filters.page > 1
                    ? 'No properties on this page.'
                    : 'No properties match just yet.'}
                </h3>
                <p>
                  {filters.page > 1
                    ? 'Listings may have changed. Start again from the first page.'
                    : 'Try a different city, property type or price range.'}
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    apply(
                      filters.page > 1
                        ? { ...filters, page: 1 }
                        : readFilters(new URLSearchParams()),
                    )
                  }
                >
                  {filters.page > 1 ? 'Go to first page' : 'Clear filters'}
                </button>
              </div>
            ))}
        </div>
        {!result.loading && result.data && result.data.meta.last_page > 1 && (
          <nav aria-label="Property pagination" className="pagination">
            <button
              className="button secondary"
              disabled={filters.page <= 1}
              onClick={() => apply({ ...filters, page: filters.page - 1 })}
            >
              Previous
            </button>
            <span>
              Page {filters.page} of {result.data.meta.last_page}
            </span>
            <button
              className="button secondary"
              disabled={filters.page >= result.data.meta.last_page}
              onClick={() => apply({ ...filters, page: filters.page + 1 })}
            >
              Next
            </button>
          </nav>
        )}
      </section>
    </>
  );
}
