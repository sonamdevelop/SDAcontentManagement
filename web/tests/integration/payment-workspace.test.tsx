import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { finance, financialBooking, opening } from '../payment-fixtures';
import type { FinancialSummary, PaymentEntry } from '../../src/staff/payments';
const base = 'http://localhost:5173/api/v1';
const meta = { current_page: 1, last_page: 1, total: 1 };
const profile = {
  id: 1,
  name: 'Staff',
  email: 'staff@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/stay-bookings/51`, () => HttpResponse.json({ data: financialBooking })),
  http.get(`${base}/admin/stay-bookings/51/payments`, () =>
    HttpResponse.json({ data: [opening], meta, summary: finance }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app() {
  sessionStorage.setItem('sda.staff.token', 'ledger-token');
  return render(
    <MemoryRouter
      initialEntries={['/staff/stay-bookings/51']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
function fillAmount(value: string) {
  fireEvent.change(screen.getByLabelText('Ledger amount'), { target: { value } });
}
it('keeps the same payment UUID even when refreshing after an uncertain save settles the balance', async () => {
  let summary = { ...finance };
  let entries: PaymentEntry[] = [opening];
  const payloads: unknown[] = [];
  server.use(
    http.get(`${base}/admin/stay-bookings/51/payments`, () =>
      HttpResponse.json({ data: entries, meta: { ...meta, total: entries.length }, summary }),
    ),
    http.post(`${base}/admin/stay-bookings/51/payments`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer ledger-token');
      expect(request.credentials).toBe('omit');
      expect(request.cache).toBe('no-store');
      const payload = await request.json();
      payloads.push(payload);
      const entry = {
        ...opening,
        id: 2,
        kind: 'payment' as const,
        amount: '3900.99',
        method: 'cash',
        reference: null,
      };
      summary = { ...finance, received_total: '4001.00', net_paid: '4001.00', balance: '0.00' };
      entries = [entry, opening];
      return payloads.length === 1
        ? HttpResponse.error()
        : HttpResponse.json({ data: entry, summary });
    }),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
  fillAmount('3900.99');
  await userEvent.click(screen.getByRole('button', { name: 'Review entry' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm financial entry' }));
  await screen.findByText(/Outcome uncertain. Retry this same financial entry/);
  expect(screen.getByRole('button', { name: 'Close financial form' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh ledger' }));
  await screen.findByRole('heading', { name: 'Payment #2' });
  expect(screen.getByLabelText('Ledger amount')).toHaveValue('3900.99');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm financial entry' }));
  await waitFor(() => expect(payloads).toHaveLength(2));
  expect(payloads[1]).toEqual(payloads[0]);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument(),
  );
});
it('records a reviewed refund with reason and updates exact totals', async () => {
  let summary: FinancialSummary = { ...finance };
  let entries = [opening];
  server.use(
    http.get(`${base}/admin/stay-bookings/51/payments`, () =>
      HttpResponse.json({ data: entries, meta, summary }),
    ),
    http.post(`${base}/admin/stay-bookings/51/refunds`, async ({ request }) => {
      expect(await request.json()).toMatchObject({
        amount: '25.25',
        method: 'cash',
        reason: 'Partial refund',
      });
      const entry = {
        ...opening,
        id: 2,
        kind: 'refund' as const,
        amount: '25.25',
        method: 'cash',
        reason: 'Partial refund',
      };
      entries = [entry, opening];
      summary = { ...finance, refunded_total: '25.25', net_paid: '74.76', balance: '3926.24' };
      return HttpResponse.json({ data: entry, summary });
    }),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Record refund' }));
  fillAmount('25.25');
  fireEvent.change(screen.getByLabelText('Ledger reason *'), {
    target: { value: 'Partial refund' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Review entry' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm financial entry' }));
  await screen.findByRole('heading', { name: 'Refund #2' });
  expect(screen.getByText(/Net paid: ₹74.76 · Outstanding: ₹3,926.24/)).toBeInTheDocument();
});
it('appends a reasoned correction rather than editing or deleting the original', async () => {
  let entries: PaymentEntry[] = [opening],
    summary = { ...finance };
  server.use(
    http.get(`${base}/admin/stay-bookings/51/payments`, () =>
      HttpResponse.json({ data: entries, meta, summary }),
    ),
    http.post(`${base}/admin/stay-bookings/51/payments/1/reverse`, async ({ request }) => {
      expect(await request.json()).toMatchObject({ reason: 'Advance recorded incorrectly' });
      const entry = {
        ...opening,
        id: 2,
        kind: 'reversal' as const,
        reversal_of: 1,
        reason: 'Advance recorded incorrectly',
      };
      entries = [entry, { ...opening, reversed_by: 2 }];
      summary = { ...finance, received_total: '0.00', net_paid: '0.00', balance: '4001.00' };
      return HttpResponse.json({ data: entry, summary });
    }),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Correct entry #1' }));
  fireEvent.change(screen.getByLabelText('Ledger reason *'), {
    target: { value: 'Advance recorded incorrectly' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Review entry' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm financial entry' }));
  await screen.findByText('Reversed by entry #2');
  expect(screen.getByRole('heading', { name: 'Opening advance #1' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Correct entry #1' })).not.toBeInTheDocument();
});
it('retains an editable rejected draft after a server balance conflict', async () => {
  server.use(
    http.post(`${base}/admin/stay-bookings/51/payments`, () =>
      HttpResponse.json(
        { errors: { amount: ['Balance changed. Refresh ledger.'] } },
        { status: 422 },
      ),
    ),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
  fillAmount('100.00');
  await userEvent.click(screen.getByRole('button', { name: 'Review entry' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm financial entry' }));
  await screen.findByText(/Balance changed/);
  expect(screen.getByLabelText('Ledger amount')).toHaveValue('100.00');
  expect(screen.getByLabelText('Ledger amount')).toBeEnabled();
});
it('keeps ledger references and actions behind the dedicated read permission', async () => {
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: { name: 'Reader', permission_type: 'custom', permissions: ['stay-bookings.view'] },
        },
      }),
    ),
  );
  app();
  await screen.findByText('Ledger history is unavailable for your role.');
  expect(screen.queryByText('Original receipt')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
});
