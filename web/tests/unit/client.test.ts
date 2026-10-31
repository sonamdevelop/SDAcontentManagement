import { afterEach, expect, it, vi } from 'vitest';
import { ApiError, PublicPropertyApi } from '../../src/api/client';
import { emptyFilters } from '../../src/domain/filters';
import { page, property } from '../fixtures';
afterEach(() => vi.unstubAllGlobals());
it('sends public requests without credentials or staff headers and fixes page size', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(page())));
  vi.stubGlobal('fetch', fetch);
  const api = new PublicPropertyApi('https://api.example.com/api/v1/');
  await api.list({ ...emptyFilters, city: 'New Delhi', purpose: 'rent', page: 2 });
  const [url, options] = fetch.mock.calls[0];
  expect(new URL(url).searchParams.get('per_page')).toBe('9');
  expect(new URL(url).searchParams.get('city')).toBe('New Delhi');
  expect(options.credentials).toBe('omit');
  expect(options.headers).not.toHaveProperty('Authorization');
});
it('handles HTML/malformed success responses without rendering a false catalogue', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>')));
  await expect(new PublicPropertyApi().list(emptyFilters)).rejects.toMatchObject({ status: 502 });
});
it('rejects invalid public contract data and never calls a private fallback', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(page([property({ status: 'reserved' as 'available' })]))),
    );
  vi.stubGlobal('fetch', fetch);
  await expect(new PublicPropertyApi().list(emptyFilters)).rejects.toMatchObject({ status: 502 });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each(['../admin/properties', '0', 'abc', '99999999999999999'])(
  'rejects malformed property route IDs: %s',
  async (id) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(new PublicPropertyApi().property(id)).rejects.toMatchObject({ status: 404 });
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('maps known field errors and retry headers while dropping private error fields', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: { email: ['Use a valid email'], internal: ['secret'], name: { bad: true } },
        }),
        { status: 422, headers: { 'Retry-After': '20' } },
      ),
    ),
  );
  const error = await new PublicPropertyApi()
    .enquire(
      7,
      { name: 'Asha', email: 'asha@example.com', phone: '', message: 'Hello', consent: true },
      'uuid',
    )
    .catch((error) => error);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).fields).toEqual({ email: 'Use a valid email' });
  expect((error as ApiError).retryAfter).toBe(20);
});
it('forwards abort signals so navigation can cancel obsolete requests', async () => {
  const signal = new AbortController().signal;
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: property() })));
  vi.stubGlobal('fetch', fetch);
  await new PublicPropertyApi().property('7', signal);
  expect(fetch.mock.calls[0][1].signal).toBe(signal);
});
it('requires the enquiry acknowledgement status before claiming success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  await expect(
    new PublicPropertyApi().enquire(
      7,
      { name: 'Asha', email: 'asha@example.com', phone: '', message: 'Hello', consent: true },
      'uuid',
    ),
  ).rejects.toMatchObject({ status: 502 });
});
