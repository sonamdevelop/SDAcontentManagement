import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { customer } from '../customer-fixtures';
import { sessionPage, onlyCurrent } from '../customer-session-fixtures';
const base = 'http://localhost:5173/api/v1/customer';
const server = setupServer(
  http.get(base + '/me', () => HttpResponse.json({ data: customer })),
  http.get(base + '/sessions', () => HttpResponse.json(sessionPage)),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app() {
  sessionStorage.setItem('sda.customer.token', 'customer-session');
  sessionStorage.setItem('sda.staff.token', 'staff-secret');
  return render(
    <MemoryRouter
      initialEntries={['/account/sessions']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('requires explicit confirmation/password, uses only customer credentials and refreshes after individual revocation', async () => {
  let deleted = false;
  server.use(
    http.get(base + '/sessions', () => HttpResponse.json(deleted ? onlyCurrent : sessionPage)),
    http.delete(base + '/sessions/8', async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-session');
      expect(request.credentials).toBe('omit');
      expect(await request.json()).toEqual({ current_password: 'CustomerPass123!' });
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  app();
  await screen.findByRole('heading', { name: 'Customer web · This device' });
  expect(
    screen.queryByRole('button', { name: 'Sign out device Customer web' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Sign out device My phone' }));
  expect(deleted).toBe(false);
  await userEvent.type(
    screen.getByLabelText('Confirm current customer password'),
    'CustomerPass123!',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm sign out device' }));
  await screen.findByText('Device sign-out confirmed. This customer session is still signed in.');
  await screen.findByText('Page 1 of 1 · 1 records');
  expect(sessionStorage.getItem('sda.customer.token')).toBe('customer-session');
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-secret');
});
it('keeps confirmation open on a wrong password, clears the field and retries all-other-device sign-out', async () => {
  let attempts = 0;
  server.use(
    http.delete(base + '/sessions/others', async ({ request }) => {
      attempts++;
      const data = (await request.json()) as { current_password: string };
      return data.current_password === 'CustomerPass123!'
        ? new HttpResponse(null, { status: 204 })
        : HttpResponse.json(
            { errors: { current_password: ['Password is incorrect.'] } },
            { status: 422 },
          );
    }),
  );
  app();
  await screen.findByRole('heading', { name: 'Customer web · This device' });
  await userEvent.click(screen.getByRole('button', { name: 'Sign out other devices' }));
  await userEvent.type(screen.getByLabelText('Confirm current customer password'), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm sign out other devices' }));
  await screen.findByText('current password: Password is incorrect.');
  expect(screen.getByLabelText('Confirm current customer password')).toHaveValue('');
  await userEvent.type(
    screen.getByLabelText('Confirm current customer password'),
    'CustomerPass123!',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm sign out other devices' }));
  await screen.findByText('Device sign-out confirmed. This customer session is still signed in.');
  expect(attempts).toBe(2);
});
it('does not claim sign-out after an unexpected success response and fails closed on malformed session data', async () => {
  server.use(http.delete(base + '/sessions/others', () => HttpResponse.json({ ok: true })));
  app();
  await screen.findByRole('heading', { name: 'Customer web · This device' });
  await userEvent.click(screen.getByRole('button', { name: 'Sign out other devices' }));
  await userEvent.type(
    screen.getByLabelText('Confirm current customer password'),
    'CustomerPass123!',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm sign out other devices' }));
  await screen.findByRole('alert');
  expect(screen.queryByText(/Device sign-out confirmed/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancel device sign-out' }));
  server.use(
    http.get(base + '/sessions', () =>
      HttpResponse.json({ ...sessionPage, data: [{ ...sessionPage.data[0], is_current: 'yes' }] }),
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Refresh device sessions' }));
  await screen.findByRole('alert');
  expect(
    screen.queryByRole('heading', { name: 'Customer web · This device' }),
  ).not.toBeInTheDocument();
});
it('expires only the customer session when the session API returns 401', async () => {
  server.use(http.get(base + '/sessions', () => HttpResponse.json({}, { status: 401 })));
  app();
  await screen.findByRole('heading', { name: 'Customer sign in' });
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-secret');
  expect(sessionStorage.getItem('sda.customer.token')).toBeNull();
});
