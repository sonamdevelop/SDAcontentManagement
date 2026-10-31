export const PROPERTY_TYPES = ['apartment', 'house', 'villa', 'plot', 'commercial'] as const;
export interface Property {
  id: number;
  title: string;
  description: string | null;
  purpose: 'sale' | 'rent';
  property_type: string;
  price: string;
  currency: string;
  rent_period: string | null;
  area: string;
  area_unit: 'sqft' | 'sqm' | 'acre';
  bedrooms: number | null;
  bathrooms: number | null;
  city: string;
  state: string;
  status: 'available';
  photos: string[];
  accepts_enquiries: boolean;
  created_at: string | null;
}
export interface PropertyPage {
  data: Property[];
  meta: { current_page: number; last_page: number; per_page: number; total: number };
}
export const label = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
export function formatPrice(price: string, currency: string): string {
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(price)) return 'Price unavailable';
  const [whole, fraction = ''] = price.split('.');
  const cents = fraction.padEnd(2, '0');
  try {
    const digits = cents === '00' ? 0 : 2;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
      .formatToParts(BigInt(whole))
      .map((part) => (part.type === 'fraction' ? cents : part.value))
      .join('');
  } catch {
    return `${currency} ${price}`;
  }
}
export function rentSuffix(property: Property): string {
  return property.purpose === 'rent'
    ? ({ daily: ' / day', monthly: ' / month', yearly: ' / year' }[property.rent_period ?? ''] ??
        '')
    : '';
}
export function safePhotoUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function isProperty(value: unknown): value is Property {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(p.id) &&
    Number(p.id) > 0 &&
    typeof p.title === 'string' &&
    typeof p.city === 'string' &&
    typeof p.state === 'string' &&
    typeof p.property_type === 'string' &&
    ['sale', 'rent'].includes(String(p.purpose)) &&
    p.status === 'available' &&
    typeof p.price === 'string' &&
    /^\d{1,13}(?:\.\d{1,2})?$/.test(p.price) &&
    typeof p.currency === 'string' &&
    typeof p.area === 'string' &&
    ['sqft', 'sqm', 'acre'].includes(String(p.area_unit)) &&
    (p.description === null || typeof p.description === 'string') &&
    (p.rent_period === null || typeof p.rent_period === 'string') &&
    [p.bedrooms, p.bathrooms].every((n) => n === null || (Number.isInteger(n) && Number(n) >= 0)) &&
    typeof p.accepts_enquiries === 'boolean' &&
    Array.isArray(p.photos) &&
    p.photos.every((x) => typeof x === 'string')
  );
}
