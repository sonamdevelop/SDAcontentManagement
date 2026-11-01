import { afterEach, expect, it, vi } from 'vitest';
import {
  can,
  isAdminProperty,
  propertyForm,
  StaffApi,
  StaffError,
  type Profile,
} from '../../src/staff/api';
import { property } from '../fixtures';
const profile: Profile = {
  id: 1,
  name: 'Agent',
  email: 'agent@example.test',
  role: { name: 'Agent', permission_type: 'custom', permissions: ['properties'] },
};
afterEach(() => vi.unstubAllGlobals());
it('requires exact action permissions and supports all roles', () => {
  expect(can(profile, 'properties')).toBe(true);
  expect(can(profile, 'properties.edit')).toBe(false);
  expect(
    can(
      { ...profile, role: { ...profile.role, permission_type: 'all', permissions: [] } },
      'properties.edit',
    ),
  ).toBe(true);
});
it('accepts private status without weakening the public property model', () => {
  expect(
    isAdminProperty({
      ...property(),
      status: 'reserved',
      address: 'Road',
      owner_name: 'Owner',
      is_published: false,
      image_paths: [],
    }),
  ).toBe(true);
  expect(isAdminProperty(property())).toBe(false);
});
it('encodes boolean flags and sale exclusions in multipart while retaining exact decimals', () => {
  const file = new File(['photo'], 'photo.webp', { type: 'image/webp' });
  const form = propertyForm(
    { purpose: 'sale', rent_period: 'monthly', price: '9999999999999.99' },
    false,
    true,
    [file],
    ['properties/1/photo.webp'],
  );
  expect(form.get('price')).toBe('9999999999999.99');
  expect(form.has('rent_period')).toBe(false);
  expect(form.get('is_published')).toBe('0');
  expect(form.get('accepts_enquiries')).toBe('1');
  expect(form.get('photos[]')).toBe(file);
  expect(form.get('remove_images[]')).toBe('properties/1/photo.webp');
});
it('uses bearer auth without cookies and lets the browser set multipart content type', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        data: {
          ...property(),
          address: 'Road',
          owner_name: 'Owner',
          is_published: false,
          image_paths: [],
        },
      }),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const form = propertyForm({ purpose: 'rent', rent_period: 'monthly' }, true, true, [], []);
  await new StaffApi('tab-token').save(form, '7');
  const options = fetch.mock.calls[0][1];
  expect(options.credentials).toBe('omit');
  expect(options.headers.Authorization).toBe('Bearer tab-token');
  expect(options.headers['Content-Type']).toBeUndefined();
  expect(form.get('_method')).toBe('PUT');
  expect(form.get('rent_period')).toBe('monthly');
});
it('revokes the client session on 401 and preserves nested validation errors', async () => {
  const rejected = vi.fn();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
  await expect(new StaffApi('expired', rejected).me()).rejects.toMatchObject({ status: 401 });
  expect(rejected).toHaveBeenCalledOnce();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ errors: { 'photos.0': ['Invalid image'], price: ['Too large'] } }),
          { status: 422 },
        ),
      ),
  );
  try {
    await new StaffApi().request('/admin/properties');
    throw new Error('Expected rejection');
  } catch (e) {
    expect(e).toBeInstanceOf(StaffError);
    expect((e as StaffError).fields['photos.0']).toEqual(['Invalid image']);
  }
});
