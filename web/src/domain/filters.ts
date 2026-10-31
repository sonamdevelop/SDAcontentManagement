import { PROPERTY_TYPES } from './property';
export const PAGE_SIZE = 9;
export interface Filters {
  q: string;
  city: string;
  purpose: string;
  property_type: string;
  min_price: string;
  max_price: string;
  page: number;
}
export const emptyFilters: Filters = {
  q: '',
  city: '',
  purpose: '',
  property_type: '',
  min_price: '',
  max_price: '',
  page: 1,
};
const pricePattern = /^\d{1,13}(?:\.\d{1,2})?$/;
export function readFilters(search: URLSearchParams): Filters {
  const page = Number(search.get('page'));
  const price = (key: string) => (pricePattern.test(search.get(key) ?? '') ? search.get(key)! : '');
  return {
    q: (search.get('q') ?? '').trim().slice(0, 255),
    city: (search.get('city') ?? '').trim().slice(0, 100),
    purpose: ['sale', 'rent'].includes(search.get('purpose') ?? '') ? search.get('purpose')! : '',
    property_type: PROPERTY_TYPES.includes(
      search.get('property_type') as (typeof PROPERTY_TYPES)[number],
    )
      ? search.get('property_type')!
      : '',
    min_price: price('min_price'),
    max_price: price('max_price'),
    page: Number.isSafeInteger(page) && page >= 1 && page <= 1000000 ? page : 1,
  };
}
export function filterError(filters: Filters): string | null {
  for (const p of [filters.min_price, filters.max_price]) {
    if (p !== '' && !pricePattern.test(p))
      return 'Enter a valid price with up to two decimal places.';
  }
  const cents = (p: string) => {
    const [a, b = ''] = p.split('.');
    return BigInt(a) * 100n + BigInt(b.padEnd(2, '0'));
  };
  if (filters.min_price && filters.max_price && cents(filters.max_price) < cents(filters.min_price))
    return 'Maximum price must be at least the minimum price.';
  return null;
}
export function filterParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['q', 'city', 'purpose', 'property_type', 'min_price', 'max_price'] as const) {
    if (filters[key].trim()) params.set(key, filters[key].trim());
  }
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}
