import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { deal } from '../deal-fixtures';
const base = 'http://localhost:5173/api/v1',
  meta = { current_page: 1, last_page: 1, total: 1 };
const profile = {
  id: 1,
  name: 'Asha',
  email: 'a@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/property-deals`, () => HttpResponse.json({ data: [deal], meta })),
  http.get(`${base}/admin/property-deals/:id`, () => HttpResponse.json({ data: deal })),
  http.get(`${base}/admin/properties`, () =>
    HttpResponse.json({ data: [{ id: 7, title: 'River home', city: 'Dandeli' }], meta }),
  ),
  http.get(`${base}/admin/leads`, () =>
    HttpResponse.json({ data: [{ id: 12, title: 'Buyer enquiry' }], meta }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/property-deals') {
  sessionStorage.setItem('sda.staff.token', 'deal-token');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
function permissions(permissions: string[]) {
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: { ...profile, role: { name: 'Custom', permission_type: 'custom', permissions } },
      }),
    ),
  );
}
async function fields() {
  await userEvent.selectOptions(await screen.findByLabelText('Property choice'), '7');
  await userEvent.selectOptions(await screen.findByLabelText('Lead choice'), '12');
  fireEvent.change(screen.getByLabelText('Agreed total'), {
    target: { value: '9999999999999.99' },
  });
  fireEvent.change(screen.getByLabelText('Recorded advance'), { target: { value: '50000.25' } });
}
it('retries uncertain reservations with the identical UUID, amounts and staff-only transport', async () => {
  const payloads: unknown[] = [];
  server.use(
    http.post(`${base}/admin/property-deals`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer deal-token');
      expect(request.credentials).toBe('omit');
      expect(request.cache).toBe('no-store');
      payloads.push(await request.json());
      return payloads.length === 1 ? HttpResponse.error() : HttpResponse.json({ data: deal });
    }),
  );
  app('/staff/property-deals/new');
  await fields();
  await userEvent.click(screen.getByRole('button', { name: 'Save reservation' }));
  await screen.findByRole('button', { name: 'Retry same reservation' });
  expect(screen.getByLabelText('Agreed total')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Retry same reservation' }));
  await screen.findByRole('heading', { name: 'Deal #41' });
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[0]).toMatchObject({
    agreed_price: '9999999999999.99',
    booking_amount: '50000.25',
  });
});
it('retains the editable draft on validation errors and starts a new request after rejection', async () => {
  const ids: string[] = [];
  server.use(
    http.post(`${base}/admin/property-deals`, async ({ request }) => {
      ids.push(((await request.json()) as { request_id: string }).request_id);
      return HttpResponse.json(
        { errors: { property_id: ['Property is no longer available.'] } },
        { status: 422 },
      );
    }),
  );
  app('/staff/property-deals/new');
  await fields();
  await userEvent.click(screen.getByRole('button', { name: 'Save reservation' }));
  await screen.findByText(/Property is no longer available/);
  expect(screen.getByLabelText('Agreed total')).toHaveValue('9999999999999.99');
  expect(screen.getByLabelText('Agreed total')).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Save reservation' }));
  await waitFor(() => expect(ids).toHaveLength(2));
  expect(ids[1]).not.toBe(ids[0]);
});
it('confirms only after explicit review and displays final state and history', async () => {
  let calls = 0;
  server.use(
    http.patch(`${base}/admin/property-deals/41/confirm`, async ({ request }) => {
      calls++;
      expect(await request.json()).toEqual({});
      return HttpResponse.json({
        data: {
          ...deal,
          status: 'confirmed',
          confirmed_at: '2026-11-02T10:00:00Z',
          events: [
            ...deal.events,
            {
              id: 2,
              actor_id: 1,
              action: 'confirmed',
              changes: { property_status: 'sold' },
              created_at: '2026-11-02T10:00:00Z',
            },
          ],
        },
      });
    }),
  );
  app('/staff/property-deals/41');
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm deal' }));
  expect(calls).toBe(0);
  await userEvent.click(screen.getByRole('button', { name: 'Yes, confirm deal' }));
  await screen.findByText('Deal outcome saved.');
  expect(screen.queryByRole('button', { name: 'Cancel reservation' })).not.toBeInTheDocument();
  expect(screen.getByText('sold')).toBeInTheDocument();
});
it('cancels with a reason without requiring lead access and renders audit text safely', async () => {
  permissions(['deals.view', 'deals.cancel', 'properties', 'properties.edit']);
  server.use(
    http.patch(`${base}/admin/property-deals/41/cancel`, async ({ request }) => {
      expect(await request.json()).toEqual({ cancellation_reason: 'Customer withdrew' });
      return HttpResponse.json({
        data: {
          ...deal,
          status: 'cancelled',
          cancelled_at: '2026-11-02T10:00:00Z',
          cancellation_reason: 'Customer withdrew',
          notes: '<script>bad()</script>',
        },
      });
    }),
  );
  app('/staff/property-deals/41');
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
  fireEvent.change(screen.getByLabelText('Cancellation reason'), {
    target: { value: 'Customer withdrew' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel reservation' }));
  await screen.findByText('Cancellation: Customer withdrew');
  expect(screen.getByText('<script>bad()</script>')).toBeInTheDocument();
  expect(document.querySelector('script')).toBeNull();
});
it('protects list-only users from detail and write actions', async () => {
  permissions(['deals']);
  app();
  await screen.findByRole('heading', { name: 'River home' });
  expect(screen.queryByRole('link', { name: 'River home' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Reserve property' })).not.toBeInTheDocument();
  expect(screen.queryByText('buyer@example.test')).not.toBeInTheDocument();
});
it('rejects malformed details and shows recoverable out-of-scope errors', async () => {
  server.use(
    http.get(`${base}/admin/property-deals/:id`, () =>
      HttpResponse.json({ message: 'Not found' }, { status: 404 }),
    ),
  );
  app('/staff/property-deals/99');
  await screen.findByRole('button', { name: 'Retry deal' });
  expect(screen.queryByRole('button', { name: 'Confirm deal' })).not.toBeInTheDocument();
});
it('filters with URL state, resets pagination and retains filters across pages', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/property-deals`, ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json({ data: [deal], meta: { ...meta, last_page: 2, total: 2 } });
    }),
  );
  app('/staff/property-deals?lead_id=12&page=2');
  await screen.findByRole('heading', { name: 'River home' });
  await userEvent.selectOptions(screen.getByLabelText('Deal status'), 'reserved');
  await userEvent.click(screen.getByRole('button', { name: 'Filter deals' }));
  await waitFor(() => expect(urls.at(-1)).toContain('status=reserved'));
  expect(urls.at(-1)).not.toContain('page=2');
  await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  expect(urls.at(-1)).toContain('lead_id=12');
});
it('locks an uncertain cancellation reason, then refreshes the committed terminal result', async () => {
  let saved = false;
  server.use(
    http.patch(`${base}/admin/property-deals/41/cancel`, () => {
      saved = true;
      return HttpResponse.error();
    }),
    http.get(`${base}/admin/property-deals/:id`, () =>
      HttpResponse.json({
        data: saved
          ? {
              ...deal,
              status: 'cancelled',
              cancelled_at: '2026-11-02T10:00:00Z',
              cancellation_reason: 'Customer withdrew',
            }
          : deal,
      }),
    ),
  );
  app('/staff/property-deals/41');
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
  fireEvent.change(screen.getByLabelText('Cancellation reason'), {
    target: { value: 'Customer withdrew' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel reservation' }));
  await screen.findByText(/Outcome uncertain/);
  expect(screen.getByLabelText('Cancellation reason')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Keep reservation' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh deal' }));
  await screen.findByText('Deal refreshed.');
  expect(screen.getByText('Cancellation: Customer withdrew')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm deal' })).not.toBeInTheDocument();
});
it('blocks malformed financial responses instead of showing outcome actions', async () => {
  server.use(
    http.get(`${base}/admin/property-deals/:id`, () =>
      HttpResponse.json({ data: { ...deal, agreed_price: 9999999999999.99 } }),
    ),
  );
  app('/staff/property-deals/41');
  await screen.findByRole('button', { name: 'Retry deal' });
  expect(screen.queryByRole('heading', { name: 'Deal #41' })).not.toBeInTheDocument();
});
it('retains cancellation text after server validation rejection', async () => {
  server.use(
    http.patch(`${base}/admin/property-deals/41/cancel`, () =>
      HttpResponse.json(
        { errors: { cancellation_reason: ['The property state changed. Refresh this deal.'] } },
        { status: 422 },
      ),
    ),
  );
  app('/staff/property-deals/41');
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
  fireEvent.change(screen.getByLabelText('Cancellation reason'), {
    target: { value: 'Customer withdrew' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel reservation' }));
  await screen.findByText(/The property state changed/);
  expect(screen.getByLabelText('Cancellation reason')).toHaveValue('Customer withdrew');
  expect(screen.getByLabelText('Cancellation reason')).toBeEnabled();
});
