import { useCallback, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ApiError, publicApi } from '../api/client';
import { useResource } from '../api/useResource';
import { formatPrice, label, rentSuffix } from '../domain/property';
import { PropertyFacts } from '../components/PropertyCard';
import { PhotoGallery } from '../components/PhotoGallery';
import { EnquiryForm } from '../components/EnquiryForm';
import { Icon } from '../components/Icon';
export function DetailPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const load = useCallback((signal: AbortSignal) => publicApi.property(id, signal), [id]);
  const result = useResource(id, load);
  const property = result.data;
  const rawSearch: unknown = location.state?.catalogSearch;
  const back =
    '/properties' + (typeof rawSearch === 'string' && rawSearch.startsWith('?') ? rawSearch : '');
  useEffect(() => {
    document.title = property
      ? `${property.title} | Stay in Dandeli`
      : 'Property details | Stay in Dandeli';
  }, [property]);
  return (
    <div className="container detail-page">
      <Link className="back-link" to={back}>
        <Icon name="arrow" style={{ transform: 'rotate(180deg)' }} />
        Back to properties
      </Link>
      {result.loading && (
        <div className="detail-loading" role="status">
          Loading property details…
        </div>
      )}
      {!result.loading && !!result.error && (
        <div className="empty-state" role="alert">
          <Icon name="house" />
          <h1>
            {result.error instanceof ApiError && result.error.status === 404
              ? 'This property is no longer available.'
              : 'We couldn’t load this property.'}
          </h1>
          <p>
            {result.error instanceof ApiError && result.error.status === 404
              ? 'Explore the latest properties to find another match.'
              : 'Please check your connection and try again.'}
          </p>
          {!(result.error instanceof ApiError && result.error.status === 404) && (
            <button className="button primary" onClick={result.retry}>
              Try again
            </button>
          )}
        </div>
      )}
      {property && (
        <>
          <div className="detail-heading">
            <div>
              <p className="eyebrow">
                {label(property.property_type)} · FOR{' '}
                {property.purpose === 'sale' ? 'SALE' : 'RENT'}
              </p>
              <h1>{property.title}</h1>
              <p className="location">
                <Icon name="pin" />
                {property.city}, {property.state}
              </p>
            </div>
            <p className="detail-price">
              {formatPrice(property.price, property.currency)}
              <small>{rentSuffix(property)}</small>
            </p>
          </div>
          <div className="detail-grid">
            <div>
              <PhotoGallery key={id} property={property} />
              <div className="detail-description">
                <PropertyFacts property={property} />
                <h2>About this property</h2>
                <p className="description-copy">
                  {property.description?.trim() ||
                    'Want to know more about this property? Ask the property team for details.'}
                </p>
                <div className="location-note">
                  <Icon name="pin" />
                  <div>
                    <strong>
                      {property.city}, {property.state}
                    </strong>
                    <p>Ask the property team for the exact location and viewing details.</p>
                  </div>
                </div>
              </div>
            </div>
            <aside>
              {property.accepts_enquiries ? (
                <EnquiryForm key={id} propertyId={property.id} />
              ) : (
                <section className="enquiry-panel">
                  <h2>Enquiries are currently closed.</h2>
                  <p>This property is not accepting new enquiries right now.</p>
                  <Link className="button secondary" to="/properties">
                    Explore other properties
                  </Link>
                </section>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
