import { useState } from 'react';
import { publicApi } from '../api/client';
import { safePhotoUrl, type Property } from '../domain/property';
import { PropertyPhoto } from './PropertyPhoto';
import { Icon } from './Icon';
export function PhotoGallery({ property }: { property: Property }) {
  const photos = property.photos
    .map((value) => safePhotoUrl(value, publicApi.baseUrl))
    .filter((s): s is string => s !== null);
  const [active, setActive] = useState(0);
  return (
    <section className="photo-gallery" aria-label="Property photos">
      <div className="gallery-main">
        <PropertyPhoto
          key={photos[active] ?? 'empty'}
          src={photos[active] ?? null}
          alt={`${property.title} — photo ${active + 1}`}
          eager
        />
        {photos.length > 1 && (
          <div className="gallery-controls">
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setActive((active - 1 + photos.length) % photos.length)}
            >
              <Icon name="chevron" style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span aria-live="polite">
              {active + 1} / {photos.length}
            </span>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setActive((active + 1) % photos.length)}
            >
              <Icon name="chevron" />
            </button>
          </div>
        )}
      </div>
      {photos.length > 1 && (
        <div className="gallery-thumbnails">
          {photos.map((src, i) => (
            <button
              key={`${src}-${i}`}
              aria-label={`View photo ${i + 1}`}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              <PropertyPhoto src={src} alt="" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
