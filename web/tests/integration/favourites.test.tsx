import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { customer } from '../customer-fixtures';
import { property } from '../fixtures';
import {
  savedProperty,
  unavailableProperty,
  favouriteMeta,
  popularityRow,
  popularityStaff,
} from '../favourite-fixtures';
const base = 'http://localhost:5173/api/v1';
const server = setupServer(
  http.get(base + '/properties/7', ({ request }) => {
    expect(request.headers.get('authorization')).toBeNull();
    return HttpResponse.json({ data: property() });
  }),
  http.get(base + '/customer/me', () => HttpResponse.json({ data: customer })),
  http.get(base + '/auth/me', () => HttpResponse.json({ data: popularityStaff })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('offers anonymous sign-in without making private calls or borrowing staff credentials', async () => {
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  app('/properties/7');
  await screen.findByRole('link', { name: 'Sign in to save this property' });
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
it('retries the same explicit save through uncertain response and throttling without toggling its intent', async () => {
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  const methods: string[] = [];
  server.use(
    http.get(base + '/customer/favourites/7', () =>
      HttpResponse.json({ data: { property_id: 7, saved: false } }),
    ),
    http.put(base + '/customer/favourites/7', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-private');
      expect(request.credentials).toBe('omit');
      methods.push(request.method);
      return methods.length === 1
        ? HttpResponse.error()
        : methods.length === 2
          ? HttpResponse.json({ message: 'Wait' }, { status: 429 })
          : HttpResponse.json({ data: { property_id: 7, saved: true } });
    }),
  );
  app('/properties/7');
  const u = userEvent.setup();
  await screen.findByRole('button', { name: 'Save property' });
  await u.click(screen.getByRole('button', { name: 'Save property' }));
  await screen.findByRole('button', { name: 'Retry saving property' });
  await u.click(screen.getByRole('button', { name: 'Retry saving property' }));
  await screen.findByText('Too many attempts. Please wait before trying again.');
  expect(screen.queryByRole('button', { name: 'Remove saved property' })).not.toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Retry saving property' }));
  await screen.findByRole('button', { name: 'Remove saved property' });
  expect(methods).toEqual(['PUT', 'PUT', 'PUT']);
});
it('paginates owned saved properties and removes unavailable rows without requesting private listing details', async () => {
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  let removed = false;
  server.use(
    http.get(base + '/customer/favourites', ({ request }) => {
      const page = new URL(request.url).searchParams.get('page') || '1';
      return HttpResponse.json({
        data: removed ? [] : [page === '2' ? unavailableProperty : savedProperty],
        meta: { current_page: Number(page), last_page: 2, total: removed ? 1 : 2 },
      });
    }),
    http.delete(base + '/customer/favourites/8', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-private');
      removed = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  app('/account/favourites?page=2');
  const u = userEvent.setup();
  await screen.findByText('This saved property is currently unavailable.');
  expect(screen.queryByText('River view apartment')).not.toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Remove saved property' }));
  await screen.findByText('You have no saved properties yet.');
  expect(removed).toBe(true);
});
it('asks older customer sessions to sign in again while preserving staff storage', async () => {
  sessionStorage.setItem('sda.customer.token', 'old-customer');
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  server.use(
    http.get(base + '/customer/favourites', () =>
      HttpResponse.json({ message: 'Forbidden' }, { status: 403 }),
    ),
  );
  app('/account/favourites');
  await screen.findByRole('button', { name: 'Sign in again for saved properties' });
  await userEvent.click(screen.getByRole('button', { name: 'Sign in again for saved properties' }));
  await screen.findByRole('button', { name: 'Sign in customer' });
  expect(sessionStorage.getItem('sda.customer.token')).toBeNull();
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
it('shows scoped aggregate counts with URL filters and no customer identity controls', async () => {
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  server.use(
    http.get(base + '/admin/property-favourites', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer staff-private');
      const p = new URL(request.url).searchParams;
      expect(p.get('property_id')).toBe('7');
      expect(p.get('min_count')).toBe('2');
      return HttpResponse.json({ data: [popularityRow], meta: favouriteMeta });
    }),
  );
  app('/staff/property-favourites?property_id=7&min_count=2');
  await screen.findByText('Saved by 2 customers');
  expect(screen.getByLabelText('Popularity property ID')).toHaveValue('7');
  expect(screen.queryByText(customer.email)).not.toBeInTheDocument();
});
