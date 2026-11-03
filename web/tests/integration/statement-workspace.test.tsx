import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { statement } from '../statement-fixtures';
const base = 'http://localhost:5173/api/v1';
const profile = {
  id: 1,
  name: 'Staff',
  email: 'staff@example.test',
  role: {
    name: 'Finance',
    permission_type: 'custom',
    permissions: ['stay-bookings.view', 'stay-bookings.payments'],
  },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/stay-bookings/51/statement`, () =>
    HttpResponse.json({ data: statement }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
  vi.restoreAllMocks();
});
afterAll(() => server.close());
function app() {
  sessionStorage.setItem('sda.staff.token', 'statement-token');
  return render(
    <MemoryRouter
      initialEntries={['/staff/stay-bookings/51/statement']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('loads a complete statement with bearer auth, prints and refreshes exact totals', async () => {
  let calls = 0;
  server.use(
    http.get(`${base}/admin/stay-bookings/51/statement`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer statement-token');
      expect(request.credentials).toBe('omit');
      calls++;
      return HttpResponse.json({
        data: {
          ...statement,
          generated_at: calls === 1 ? statement.generated_at : '2030-01-03T10:00:00Z',
        },
      });
    }),
  );
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  app();
  await screen.findByRole('heading', { name: 'Stay booking statement #51' });
  expect(screen.getByText('₹3,900.99', { exact: true })).toBeInTheDocument();
  expect(
    screen.getByText('All 1 ledger entries, in recorded order.', { exact: false }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Print statement' }));
  expect(print).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh statement' }));
  await screen.findByRole('heading', { name: 'Stay booking statement #51' });
  expect(calls).toBe(2);
  expect(screen.getByRole('link', { name: 'Back to booking' })).toHaveAttribute(
    'href',
    '/staff/stay-bookings/51',
  );
});
it('does not fetch statements without ledger access', async () => {
  let calls = 0;
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: { ...profile, role: { ...profile.role, permissions: ['stay-bookings.view'] } },
      }),
    ),
    http.get(`${base}/admin/stay-bookings/51/statement`, () => {
      calls++;
      return HttpResponse.json({ data: statement });
    }),
  );
  app();
  await screen.findByText('Booking statements need booking detail and payment ledger permissions.');
  expect(calls).toBe(0);
  expect(screen.queryByRole('button', { name: 'Print statement' })).not.toBeInTheDocument();
});
it('refuses an incomplete ledger and allows a fresh retry without printing it', async () => {
  let calls = 0;
  server.use(
    http.get(`${base}/admin/stay-bookings/51/statement`, () =>
      HttpResponse.json({ data: ++calls === 1 ? { ...statement, entries: [] } : statement }),
    ),
  );
  app();
  await screen.findByRole('button', { name: 'Retry statement' });
  expect(screen.queryByRole('button', { name: 'Print statement' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retry statement' }));
  await screen.findByRole('button', { name: 'Print statement' });
});
