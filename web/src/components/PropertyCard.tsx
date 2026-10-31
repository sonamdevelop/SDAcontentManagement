import { Link, useLocation } from 'react-router-dom';
import { publicApi } from '../api/client';
import { formatPrice, label, rentSuffix, safePhotoUrl, type Property } from '../domain/property';
import { Icon } from './Icon';
import { PropertyPhoto } from './PropertyPhoto';
export function PropertyFacts({ property }: { property: Property }) {
  return (
    <ul className="property-facts" aria-label="Property features">
      {!!property.bedrooms && (
        <li>
          <Icon name="bed" />
          {property.bedrooms} beds
        </li>
      )}
      {!!property.bathrooms && (
        <li>
          <Icon name="bath" />
          {property.bathrooms} baths
        </li>
      )}
      <li>
        <Icon name="area" />
        {property.area} {{ sqft: 'sq ft', sqm: 'sq m', acre: 'acres' }[property.area_unit]}
      </li>
    </ul>
  );
}
export function PropertyCard({ property }: { property: Property }) {
  const location = useLocation();
  const p = property;
  const photo =
    p.photos.map((value) => safePhotoUrl(value, publicApi.baseUrl)).find(Boolean) ?? null;
  return (
    <article className="property-card">
      <Link
        to={`/properties/${p.id}`}
        state={{ catalogSearch: location.search }}
        aria-labelledby={`property-${p.id}`}
      >
        <div className="card-photo">
          <PropertyPhoto src={photo} alt={p.title} />
          <span className="purpose-badge">For {p.purpose === 'sale' ? 'sale' : 'rent'}</span>
        </div>
        <div className="card-body">
          <p className="eyebrow">{label(p.property_type)}</p>
          <h3 id={`property-${p.id}`}>{p.title}</h3>
          <p className="location">
            <Icon name="pin" />
            {p.city}, {p.state}
          </p>
          <PropertyFacts property={p} />
          <div className="card-bottom">
            <p className="price">
              {formatPrice(p.price, p.currency)}
              <small>{rentSuffix(p)}</small>
            </p>
            <span className="card-arrow">
              <Icon name="arrow" />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
