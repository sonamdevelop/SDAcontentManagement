import type { Property, PropertyPage } from '../src/domain/property';
export function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 7,
    title: 'River view apartment',
    description: 'A bright home near the river.',
    purpose: 'sale',
    property_type: 'apartment',
    price: '6500000.50',
    currency: 'INR',
    rent_period: null,
    area: '1200.00',
    area_unit: 'sqft',
    bedrooms: 2,
    bathrooms: 2,
    city: 'Dandeli',
    state: 'Karnataka',
    status: 'available',
    photos: [],
    accepts_enquiries: true,
    created_at: '2026-10-31T12:00:00+05:30',
    ...overrides,
  };
}
export function page(
  properties = [property()],
  current = 1,
  last = 1,
  total = properties.length,
): PropertyPage {
  return { data: properties, meta: { current_page: current, last_page: last, per_page: 9, total } };
}
