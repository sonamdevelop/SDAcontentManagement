import { describe, expect, it } from 'vitest';
import { emptyFilters, filterError, filterParams, readFilters } from '../../src/domain/filters';
import { EnquiryAttempt, normalizeEnquiry, validateEnquiry } from '../../src/domain/enquiry';
import { formatPrice, rentSuffix, safePhotoUrl } from '../../src/domain/property';
import { property } from '../fixtures';
const draft = {
  name: ' Asha Rao ',
  email: ' ASHA@EXAMPLE.COM ',
  phone: '+91 9000000000',
  message: ' Please arrange a visit. ',
  consent: true,
};

describe('public filters', () => {
  it('whitelists catalogue fields and resets hostile/invalid paging and enum values', () => {
    expect(
      readFilters(
        new URLSearchParams(
          'purpose=invalid&property_type=invalid&page=-4&status=sold&user_id=9&min_price=-1',
        ),
      ),
    ).toEqual(emptyFilters);
  });
  it('encodes cities and keywords correctly without passing private/unknown filters', () => {
    const filters = readFilters(
      new URLSearchParams('q=River%20%26%20garden&city=New%20Delhi&purpose=rent&page=2'),
    );
    const params = filterParams(filters);
    expect(params.get('q')).toBe('River & garden');
    expect(params.get('city')).toBe('New Delhi');
    expect(params.get('page')).toBe('2');
    expect(params.has('status')).toBe(false);
  });
  it.each([
    ['10.25', '10.24'],
    ['9999999999999.99', '9999999999999.98'],
  ])('validates price bounds exactly: %s / %s', (min, max) => {
    expect(filterError({ ...emptyFilters, min_price: min, max_price: max })).toContain(
      'Maximum price',
    );
  });
  it.each(['1e3', '-1', '1.001', '10000000000000', 'abc'])(
    'rejects malformed visible price inputs: %s',
    (price) => {
      expect(filterError({ ...emptyFilters, min_price: price })).toContain('valid price');
    },
  );
  it('accepts zero prices and equivalent decimal bounds', () => {
    expect(filterError({ ...emptyFilters, min_price: '0', max_price: '0.00' })).toBeNull();
  });
});
describe('money and public photos', () => {
  it('preserves exact large decimal prices and Indian currency grouping', () => {
    expect(formatPrice('6500000.50', 'INR')).toBe('₹65,00,000.50');
    expect(formatPrice('9999999999999.99', 'INR')).toBe('₹99,99,99,99,99,999.99');
    expect(formatPrice('0', 'INR')).toBe('₹0');
  });
  it.each(['javascript:alert(1)', 'data:image/svg+xml,abc', 'https://user:pass@example.com/a.jpg'])(
    'rejects unsafe image URLs: %s',
    (url) => {
      expect(safePhotoUrl(url, 'https://api.example.com/api/v1')).toBeNull();
    },
  );
  it('resolves relative public storage paths to the API origin', () => {
    expect(safePhotoUrl('/storage/properties/front.jpg', 'https://api.example.com/api/v1')).toBe(
      'https://api.example.com/storage/properties/front.jpg',
    );
  });
  it('shows a rental period only for rental properties', () => {
    expect(rentSuffix(property({ purpose: 'rent', rent_period: 'monthly' }))).toBe(' / month');
    expect(rentSuffix(property())).toBe('');
  });
});
describe('enquiry validation and retry identity', () => {
  it('normalizes fields and requires explicit contact consent', () => {
    expect(normalizeEnquiry(draft).email).toBe('asha@example.com');
    expect(validateEnquiry(draft)).toEqual({});
    expect(validateEnquiry({ ...draft, consent: false })).toHaveProperty('consent');
    expect(validateEnquiry({ ...draft, phone: '' })).toEqual({});
  });
  it('validates required fields and phone characters', () => {
    expect(
      Object.keys(
        validateEnquiry({ name: '', email: 'bad', phone: 'letters', message: '', consent: false }),
      ),
    ).toHaveLength(5);
  });
  it('keeps the same UUID for equivalent retries and rotates it for changed data', () => {
    let next = 0;
    const attempt = new EnquiryAttempt(() => `uuid-${++next}`);
    expect(attempt.keyFor(draft)).toBe('uuid-1');
    expect(attempt.keyFor({ ...draft, name: 'Asha Rao', email: 'asha@example.com' })).toBe(
      'uuid-1',
    );
    expect(attempt.keyFor({ ...draft, message: ' Please arrange a visit. \r\n' })).toBe('uuid-1');
    expect(attempt.keyFor({ ...draft, message: 'A different question' })).toBe('uuid-2');
  });
});
