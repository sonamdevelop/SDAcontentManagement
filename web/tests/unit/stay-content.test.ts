import { expect, it } from 'vitest';
import { isPublicStay } from '../../src/api/stay-catalogue';
import { contentForm } from '../../src/staff/StayContentWorkspace';
import { publicStay } from '../stay-content-fixtures';
it('requires complete published room data, exact rates and safe gallery URLs', () => {
  expect(isPublicStay(publicStay, true)).toBe(true);
  expect(isPublicStay({ ...publicStay, rooms: [] }, true)).toBe(false);
  expect(isPublicStay({ ...publicStay, from_rate: '0.01' }, true)).toBe(false);
  expect(isPublicStay({ ...publicStay, photos: ['javascript:alert(1)'] }, true)).toBe(false);
  expect(isPublicStay({ ...publicStay, timezone: 'invalid' }, true)).toBe(false);
});
it('encodes content publication and distinct amenities without allowing arbitrary image removal', () => {
  const form = document.createElement('form');
  form.innerHTML =
    '<textarea name="description">Forest stay</textarea><textarea name="amenities">Wi-Fi\nParking</textarea><input name="is_published" type="checkbox" checked>';
  const body = contentForm(form, []);
  expect(body.get('is_published')).toBe('1');
  expect(body.get('amenities[1]')).toBe('Parking');
  form.querySelector('textarea[name=amenities]')!.textContent = 'Parking\nParking';
  expect(() => contentForm(form, [])).toThrow('distinct');
});
