import { property } from './fixtures';
import type { SavedProperty } from '../src/domain/favourites';
export const savedProperty: SavedProperty = {
  property_id: 7,
  saved_at: '2026-11-04T10:00:00Z',
  property: property(),
};
export const unavailableProperty: SavedProperty = {
  property_id: 8,
  saved_at: '2026-11-04T09:00:00Z',
  property: null,
};
export const favouriteMeta = { current_page: 1, last_page: 1, total: 1 };
export const popularityRow = {
  id: 7,
  title: 'River view apartment',
  city: 'Dandeli',
  status: 'available',
  moderation_status: 'approved',
  is_published: true,
  favourites_count: 2,
};
export const popularityStaff = {
  id: 1,
  name: 'Property staff',
  email: 'staff@example.test',
  role: { name: 'Property reader', permission_type: 'custom', permissions: ['properties'] },
};
