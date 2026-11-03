import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { CUSTOMER_TOKEN_KEY } from '../../src/customer/api';
import { customer, customerBooking, customerPage } from '../customer-fixtures';
const base = 'http://localhost:5173/api/v1/customer';
const server = setupServer(
  http.get(`${base}/me`, () => HttpResponse.json({ data: customer })),
  http.get(`${base}/bookings`, () => HttpResponse.json(customerPage)),
  http.get(`${base}/bookings/51`, () => HttpResponse.json({ data: customerBooking })),
  http.post(`${base}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/account') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('registers without any staff bearer, reads only customer bookings and preserves staff storage on logout', async () => {
  sessionStorage.setItem('sda.staff.token', 'staff-token');
  server.use(
    http.post(`${base}/auth/register`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.credentials).toBe('omit');
      expect(await request.json()).toMatchObject({
        name: 'Asha Customer',
        email: 'asha@example.test',
      });
      return HttpResponse.json(
        {
          data: {
            access_token: 'customer-token',
            token_type: 'Bearer',
            expires_at: '2030-01-01T00:00:00Z',
          },
        },
        { status: 201 },
      );
    }),
    http.get(`${base}/me`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-token');
      return HttpResponse.json({ data: customer });
    }),
  );
  app();
  await userEvent.click(screen.getByRole('button', { name: 'Create customer account' }));
  await userEvent.type(screen.getByLabelText('Customer name', { exact: true }), customer.name);
  await userEvent.type(screen.getByLabelText('Customer email', { exact: true }), customer.email);
  await userEvent.type(
    screen.getByLabelText('Customer password', { exact: true }),
    'CustomerPass123!',
  );
  await userEvent.type(
    screen.getByLabelText('Confirm customer password', { exact: true }),
    'CustomerPass123!',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Register customer' }));
  await screen.findByRole('heading', { name: 'My customer account' });
  await userEvent.click(screen.getByRole('link', { name: 'My bookings' }));
  await screen.findByRole('link', { name: 'Historic forest stay — Deluxe #51' });
  await userEvent.click(screen.getByRole('link', { name: 'Historic forest stay — Deluxe #51' }));
  await screen.findByRole('heading', { name: 'My booking #51' });
  expect(screen.getByText(/Outstanding: ₹3,900.99/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out customer' }));
  await screen.findByText('Signed out.');
  expect(sessionStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-token');
});
it('changes the customer password and clears only the customer session after server confirmation', async () => {
  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, 'customer-token');
  sessionStorage.setItem('sda.staff.token', 'staff-token');
  server.use(
    http.post(`${base}/password`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-token');
      expect(await request.json()).toMatchObject({
        current_password: 'CustomerPass123!',
        password: 'ReplacementPass456!',
      });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  app('/account/password');
  await screen.findByRole('heading', { name: 'Change customer password' });
  await userEvent.type(
    screen.getByLabelText('Current customer password', { exact: true }),
    'CustomerPass123!',
  );
  await userEvent.type(
    screen.getByLabelText('New customer password', { exact: true }),
    'ReplacementPass456!',
  );
  await userEvent.type(
    screen.getByLabelText('Confirm new customer password', { exact: true }),
    'ReplacementPass456!',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Update customer password' }));
  await screen.findByText('Password changed. Sign in with your new password.');
  expect(sessionStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-token');
});
it('does not substitute a staff token for a missing or expired customer session', async () => {
  sessionStorage.setItem('sda.staff.token', 'staff-token');
  let calls = 0;
  server.use(
    http.get(`${base}/me`, () => {
      calls++;
      return HttpResponse.json({ message: 'Unauthenticated' }, { status: 401 });
    }),
  );
  app('/account/bookings');
  await screen.findByRole('button', { name: 'Sign in customer' });
  expect(calls).toBe(0);
  expect(screen.queryByText(/Historic forest stay/)).not.toBeInTheDocument();
});
it('keeps customer URL status filters through paging and hides a forbidden booking detail', async () => {
  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, 'customer-token');
  const urls: string[] = [];
  server.use(
    http.get(`${base}/bookings`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-token');
      expect(request.credentials).toBe('omit');
      urls.push(request.url);
      const p = new URL(request.url).searchParams;
      return HttpResponse.json({
        ...customerPage,
        meta: { current_page: Number(p.get('page') || 1), last_page: 2, total: 2 },
      });
    }),
    http.get(`${base}/bookings/51`, () =>
      HttpResponse.json({ message: 'Not found' }, { status: 404 }),
    ),
  );
  app('/account/bookings?status=confirmed');
  await screen.findByRole('link', { name: 'Historic forest stay — Deluxe #51' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  expect(urls.at(-1)).toContain('status=confirmed');
  await userEvent.click(screen.getByRole('link', { name: 'Historic forest stay — Deluxe #51' }));
  await screen.findByText('This booking is not available to your account.');
  expect(screen.queryByRole('heading', { name: 'My booking #51' })).not.toBeInTheDocument();
});
it('retains the customer session when sign-out cannot be confirmed so it can be retried', async () => {
  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, 'customer-token');
  let attempts = 0;
  server.use(
    http.post(`${base}/auth/logout`, () =>
      ++attempts === 1
        ? HttpResponse.error()
        : attempts === 2
          ? HttpResponse.json({ data: null })
          : new HttpResponse(null, { status: 204 }),
    ),
  );
  app();
  await screen.findByRole('button', { name: 'Sign out customer' });
  await userEvent.click(screen.getByRole('button', { name: 'Sign out customer' }));
  await screen.findByRole('alert');
  expect(sessionStorage.getItem(CUSTOMER_TOKEN_KEY)).toBe('customer-token');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out customer' }));
  await screen.findByRole('alert');
  expect(sessionStorage.getItem(CUSTOMER_TOKEN_KEY)).toBe('customer-token');
  await userEvent.click(screen.getByRole('button', { name: 'Sign out customer' }));
  await screen.findByText('Signed out.');
});
it('returns an expired booking request to customer login without clearing staff storage', async () => {
  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, 'expired-customer');
  sessionStorage.setItem('sda.staff.token', 'staff-token');
  server.use(
    http.get(`${base}/bookings`, () =>
      HttpResponse.json({ message: 'Unauthenticated' }, { status: 401 }),
    ),
  );
  app('/account/bookings');
  await screen.findByText('Your customer session ended. Please sign in again.');
  expect(sessionStorage.getItem(CUSTOMER_TOKEN_KEY)).toBeNull();
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-token');
});
