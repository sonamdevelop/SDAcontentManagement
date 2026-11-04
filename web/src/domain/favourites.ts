import { isProperty, type Property } from './property';
export type SavedProperty = { property_id: number; saved_at: string; property: Property | null };
export type FavouriteStatus = { property_id: number; saved: boolean };
export function isSavedProperty(v: unknown): v is SavedProperty {
  if (!v || typeof v !== 'object') return false;
  const r = v as SavedProperty;
  return (
    Number.isSafeInteger(r.property_id) &&
    r.property_id > 0 &&
    typeof r.saved_at === 'string' &&
    Number.isFinite(Date.parse(r.saved_at)) &&
    (r.property === null || (isProperty(r.property) && r.property.id === r.property_id))
  );
}
export function isFavouriteStatus(v: unknown, id: number): v is FavouriteStatus {
  return (
    !!v &&
    typeof v === 'object' &&
    (v as FavouriteStatus).property_id === id &&
    typeof (v as FavouriteStatus).saved === 'boolean'
  );
}
export function popularityFilters(values: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const k of ['property_id', 'min_count']) {
    const value = values[k];
    if (value) {
      if (
        !/^[1-9]\d*$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        (k === 'min_count' && Number(value) > 1000000000)
      )
        throw new Error('Use positive whole-number filters.');
      p.set(k, value);
    }
  }
  return p;
}
