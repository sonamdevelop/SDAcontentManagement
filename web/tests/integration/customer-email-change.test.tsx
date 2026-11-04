import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { customer } from '../customer-fixtures';
const base = 'http://localhost:5173/api/v1/customer',
  token = 'a'.repeat(64),
  email = 'new@example.test';
const fragment = '#' + new URLSearchParams({ customer_id: '7', email, token });
const server = setupServer(http.get(base + '/me', () => HttpResponse.json({ data: customer })));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function Location() {
  const l = useLocation();
  return <output aria-label="Current URL">{l.pathname + l.hash}</output>;
}
function app(path = '/account/email') {
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  sessionStorage.setItem('sda.staff.token', 'staff-private');
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
it('requests a new email with customer credentials while the current sign-in email stays unchanged', async () => {
  let pending = false;
  server.use(
    http.get(base + '/email-change', () =>
      HttpResponse.json({
        data: pending ? { new_email: email, expires_at: '2030-01-01T00:00:00Z' } : null,
      }),
    ),
    http.post(base + '/email-change', async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-private');
      expect(request.credentials).toBe('omit');
      expect(await request.json()).toEqual({
        new_email: email,
        current_password: 'CustomerPass123!',
      });
      pending = true;
      return HttpResponse.json({ message: 'Accepted' }, { status: 202 });
    }),
  );
  app();
  await screen.findByText('No active email change request.');
  await userEvent.type(screen.getByLabelText('New customer email'), email);
  await userEvent.type(screen.getByLabelText('Current customer password'), 'CustomerPass123!');
  await userEvent.click(screen.getByRole('button', { name: 'Send new email confirmation' }));
  await screen.findByRole('heading', { name: 'Pending new email' });
  expect(screen.getByText(/Current sign-in email: asha@example.test/)).toBeInTheDocument();
  expect(screen.getByLabelText('Current customer password')).toHaveValue('');
  expect(sessionStorage.getItem('sda.customer.token')).toBe('customer-private');
});
it('cancels only after explicit password confirmation and preserves the current session', async () => {
  let pending = true;
  server.use(
    http.get(base + '/email-change', () =>
      HttpResponse.json({
        data: pending ? { new_email: email, expires_at: '2030-01-01T00:00:00Z' } : null,
      }),
    ),
    http.delete(base + '/email-change', async ({ request }) => {
      expect(await request.json()).toEqual({ current_password: 'CustomerPass123!' });
      pending = false;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel pending email change' }));
  expect(pending).toBe(true);
  await userEvent.type(screen.getByLabelText('Current customer password'), 'CustomerPass123!');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm cancel email change' }));
  await screen.findByText('No active email change request.');
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
it('removes fragment secrets, waits for explicit confirmation and sends no stored bearer', async () => {
  let calls = 0;
  server.use(
    http.post(base + '/auth/change-email', async ({ request }) => {
      calls++;
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.credentials).toBe('omit');
      expect(await request.json()).toEqual({ customer_id: 7, email, token });
      return new HttpResponse(null, { status: 204 });
    }),
  );
  app('/account/change-email' + fragment);
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('/account/change-email');
  expect(screen.getByLabelText('Current URL')).not.toHaveTextContent(token);
  expect(calls).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm customer email change' }));
  await screen.findByText(
    'Email changed and verified. Sign in again with your new email. All previous customer sessions have ended.',
  );
  expect(sessionStorage.getItem('sda.customer.token')).toBeNull();
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-private');
});
it('does not clear sessions or claim success after an invalid/expired confirmation or malformed pending response', async () => {
  server.use(
    http.post(base + '/auth/change-email', () =>
      HttpResponse.json({ errors: { token: ['Link is invalid.'] } }, { status: 422 }),
    ),
  );
  const view = app('/account/change-email' + fragment);
  await userEvent.click(screen.getByRole('button', { name: 'Confirm customer email change' }));
  await screen.findByText('token: Link is invalid.');
  expect(sessionStorage.getItem('sda.customer.token')).toBe('customer-private');
  view.unmount();
  server.use(
    http.get(base + '/email-change', () =>
      HttpResponse.json({ data: { new_email: email, expires_at: 'bad-date', token: 'private' } }),
    ),
  );
  app();
  await screen.findByRole('alert');
  expect(screen.queryByRole('heading', { name: 'Pending new email' })).not.toBeInTheDocument();
});
