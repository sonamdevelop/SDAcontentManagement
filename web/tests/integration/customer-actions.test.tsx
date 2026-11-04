import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { customer } from '../customer-fixtures';
import { reservationQuote } from '../reservation-fixtures';
const base = 'http://localhost:5173/api/v1/customer',
  token = 'a'.repeat(64),
  link = '#' + new URLSearchParams({ email: customer.email, token });
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function Location() {
  const location = useLocation();
  return <output aria-label="Current URL">{location.pathname + location.hash}</output>;
}
function app(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
      <Location />
    </MemoryRouter>,
  );
}
it('sends neutral public recovery without either bearer token', async () => {
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  server.use(
    http.post(base + '/auth/forgot-password', async ({ request }) => {
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.credentials).toBe('omit');
      expect(await request.json()).toEqual({ email: customer.email });
      return HttpResponse.json({ message: 'Accepted' }, { status: 202 });
    }),
  );
  app('/account/forgot');
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('Recovery email'), customer.email);
  await u.click(screen.getByRole('button', { name: 'Send password reset email' }));
  await screen.findByText(
    'If the account is eligible, a reset link will be sent. Check your inbox.',
  );
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
it('removes link secrets from navigation and explicitly verifies without signing in', async () => {
  let calls = 0;
  server.use(
    http.post(base + '/auth/verify-email', async ({ request }) => {
      calls++;
      expect(request.headers.get('authorization')).toBeNull();
      expect(await request.json()).toEqual({ email: customer.email, token });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  app('/account/verify' + link);
  await waitFor(() =>
    expect(screen.getByLabelText('Current URL')).toHaveTextContent('/account/verify'),
  );
  expect(screen.getByLabelText('Current URL').textContent).not.toContain(token);
  expect(calls).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm email verification' }));
  await screen.findByText('Email verified. Return to your account to refresh its status.');
  expect(calls).toBe(1);
  expect(sessionStorage.getItem('sda.customer.token')).toBeNull();
});
it('retains customer session after rejected reset and clears it only after confirmed reset, preserving staff', async () => {
  sessionStorage.setItem('sda.customer.token', 'old-customer');
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  let calls = 0;
  server.use(
    http.post(base + '/auth/reset-password', async ({ request }) => {
      expect(request.headers.get('authorization')).toBeNull();
      expect(await request.json()).toMatchObject({
        email: customer.email,
        token,
        password: 'RecoveredPass456!',
      });
      return ++calls === 1
        ? HttpResponse.json({ errors: { token: ['Expired or used.'] } }, { status: 422 })
        : new HttpResponse(null, { status: 204 });
    }),
  );
  app('/account/reset' + link);
  const u = userEvent.setup();
  await u.type(screen.getByLabelText('New recovery password'), 'RecoveredPass456!');
  await u.type(screen.getByLabelText('Confirm recovery password'), 'RecoveredPass456!');
  await u.click(screen.getByRole('button', { name: 'Save recovered password' }));
  await screen.findByText('token: Expired or used.');
  expect(sessionStorage.getItem('sda.customer.token')).toBe('old-customer');
  await u.click(screen.getByRole('button', { name: 'Save recovered password' }));
  await screen.findByText('Password reset. Sign in again with your new password.');
  expect(sessionStorage.getItem('sda.customer.token')).toBeNull();
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
it('shows verification state and sends only an authenticated customer resend', async () => {
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  server.use(
    http.get(base + '/me', () =>
      HttpResponse.json({ data: { ...customer, email_verified_at: null } }),
    ),
    http.post(base + '/email/verification', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-private');
      return HttpResponse.json({ message: 'Accepted' }, { status: 202 });
    }),
  );
  app('/account');
  await screen.findByText('Email not verified. Verify your email before making a new reservation.');
  await userEvent.click(screen.getByRole('button', { name: 'Send verification email' }));
  await screen.findByText(/If eligible, a verification link has been sent/);
});
it('allows unverified date quotes while directing the customer to verification before review', async () => {
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  server.use(
    http.get(base + '/me', () =>
      HttpResponse.json({ data: { ...customer, email_verified_at: null } }),
    ),
    http.get(base + '/rooms/2/availability', () => HttpResponse.json({ data: reservationQuote })),
  );
  app('/account/reserve?room_type_id=2');
  const u = userEvent.setup();
  await screen.findByLabelText('Reservation check-in');
  await u.type(screen.getByLabelText('Reservation check-in'), '2030-01-01');
  await u.type(screen.getByLabelText('Reservation check-out'), '2030-01-03');
  await u.click(screen.getByRole('button', { name: 'Check room availability' }));
  await screen.findByText(/rooms available/);
  expect(screen.queryByRole('button', { name: 'Review reservation' })).not.toBeInTheDocument();
  expect(screen.getByText(/before creating a reservation/)).toBeInTheDocument();
});
it('rejects incomplete links before requesting a reset', async () => {
  app('/account/reset#token=bad');
  expect(screen.getByText(/This email link is incomplete/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save recovered password' })).not.toBeInTheDocument();
});
