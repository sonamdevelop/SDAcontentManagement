import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { stay, stayMeta as meta } from '../stay-fixtures';
import { followUps, refundRow } from '../payment-followup-fixtures';
const base = 'http://localhost:5173/api/v1';
const profile = {
  id: 1,
  name: 'Finance',
  email: 'staff@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/stays`, () => HttpResponse.json({ data: [stay], meta })),
  http.get(`${base}/admin/stays/1/payment-follow-ups`, () => HttpResponse.json(followUps)),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app() {
  sessionStorage.setItem('sda.staff.token', 'finance-token');
  return render(
    <MemoryRouter
      initialEntries={['/staff/stay-payment-follow-ups?stay_id=1&view=collection']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('shows exact balances and preserves selected stay when switching queues and pages', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/stays/1/payment-follow-ups`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer finance-token');
      expect(request.credentials).toBe('omit');
      urls.push(request.url);
      const p = new URL(request.url).searchParams,
        view = p.get('view') || 'collection';
      return HttpResponse.json({
        ...followUps,
        data: [view === 'refund' ? refundRow : followUps.data[0]],
        context: { ...followUps.context, view },
        meta: { current_page: Number(p.get('page') || 1), last_page: 2, total: 2 },
      });
    }),
  );
  app();
  await screen.findByText('Pending collection: ₹0.01');
  await userEvent.click(screen.getByRole('button', { name: 'Pending refund (1)' }));
  await screen.findByText('Pending refund: ₹74.99');
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Next' }).find((b) => !b.hasAttribute('disabled'))!,
  );
  await waitFor(() => expect(urls.at(-1)).toContain('view=refund&page=2'));
  expect(urls.at(-1)).toContain('/stays/1/');
});
it('refreshes a settled queue without offering mutations', async () => {
  let calls = 0;
  server.use(
    http.get(`${base}/admin/stays/1/payment-follow-ups`, () =>
      HttpResponse.json(
        ++calls === 1
          ? followUps
          : {
              ...followUps,
              data: [],
              meta: { ...meta, total: 0 },
              context: { ...followUps.context, counts: { collection: 0, refund: 1 } },
            },
      ),
    ),
  );
  app();
  await screen.findByText('Pending collection: ₹0.01');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh payment follow-up' }));
  await screen.findByText('No bookings in this payment queue.');
  expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
});
it('does not request finance or stay data without payment ledger access', async () => {
  let calls = 0;
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: {
            name: 'Reader',
            permission_type: 'custom',
            permissions: ['stays', 'stay-bookings', 'stay-bookings.view'],
          },
        },
      }),
    ),
    http.get(`${base}/admin/stays`, () => {
      calls++;
      return HttpResponse.json({ data: [stay], meta });
    }),
    http.get(`${base}/admin/stays/1/payment-follow-ups`, () => {
      calls++;
      return HttpResponse.json(followUps);
    }),
  );
  app();
  await screen.findByText(
    'Payment follow-up needs stay, booking list/detail and payment ledger permissions.',
  );
  expect(calls).toBe(0);
});
it('rejects inconsistent money instead of displaying a false balance', async () => {
  server.use(
    http.get(`${base}/admin/stays/1/payment-follow-ups`, () =>
      HttpResponse.json({ ...followUps, data: [{ ...followUps.data[0], balance: '100.00' }] }),
    ),
  );
  app();
  await screen.findByRole('button', { name: 'Retry payment follow-up' });
  expect(screen.queryByText('Pending collection: ₹100')).not.toBeInTheDocument();
});
