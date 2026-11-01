import { useState } from 'react';
import { Icon } from './Icon';
export function PropertyPhoto({
  src,
  alt,
  eager = false,
}: {
  src: string | null;
  alt: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />
  ) : (
    <div className="photo-placeholder" role="img" aria-label="No property photo available">
      <Icon name="house" />
      <span>Photos coming soon</span>
    </div>
  );
}
