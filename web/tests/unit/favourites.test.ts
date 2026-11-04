import { expect, it } from 'vitest';
import { isSavedProperty, isFavouriteStatus, popularityFilters } from '../../src/domain/favourites';
import { savedProperty, unavailableProperty } from '../favourite-fixtures';
it('accepts redacted unavailable rows but rejects mismatched or nonpublic property payloads', () => {
  expect(isSavedProperty(savedProperty)).toBe(true);
  expect(isSavedProperty(unavailableProperty)).toBe(true);
  expect(isSavedProperty({ ...savedProperty, property_id: 8 })).toBe(false);
  expect(
    isSavedProperty({
      ...savedProperty,
      property: { ...savedProperty.property, status: 'reserved' },
    }),
  ).toBe(false);
  expect(isFavouriteStatus({ property_id: 7, saved: true }, 7)).toBe(true);
  expect(isFavouriteStatus({ property_id: 8, saved: true }, 7)).toBe(false);
});
it('keeps popularity filters valid whole numbers without inventing financial totals', () => {
  expect(popularityFilters({ property_id: '7', min_count: '2' }).toString()).toBe(
    'property_id=7&min_count=2',
  );
  expect(() => popularityFilters({ min_count: '1.5' })).toThrow();
  expect(() => popularityFilters({ property_id: '0' })).toThrow();
});
