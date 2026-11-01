import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { visit } from '../visit-fixtures';
import { meta } from '../lead-fixtures';
const base = 'http://localhost:5173/api/v1';
const profile = {
  id: 1,
  name: 'Asha',
  email: 'asha@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/site-visits`, () => HttpResponse.json({ data: [visit], meta })),
  http.get(`${base}/admin/site-visits/:id`, ({ params }) =>
    HttpResponse.json({ data: { ...visit, id: Number(params.id) } }),
  ),
  http.get(`${base}/admin/properties`, () =>
    HttpResponse.json({ data: [{ id: 7, title: 'River home', city: 'Dandeli' }], meta }),
  ),
  http.get(`${base}/admin/leads`, () =>
    HttpResponse.json({ data: [{ id: 12, title: 'Buyer enquiry' }], meta }),
  ),
  http.get(`${base}/admin/site-visit-agents`, () =>
    HttpResponse.json({ data: [{ id: 2, name: 'Ravi' }], meta }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/site-visits') {
  sessionStorage.setItem('sda.staff.token', 'staff-token');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
function permissions(values: string[]) {
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: { name: 'Custom', permission_type: 'custom', permissions: values },
        },
      }),
    ),
  );
}
async function createFields() {
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Property choice' }),
    '7',
  );
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Lead choice' }), '12');
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Visit agent choice' }),
    '2',
  );
  fireEvent.change(screen.getByLabelText('Visit start'), { target: { value: '2030-01-01T10:00' } });
  fireEvent.change(screen.getByLabelText('Visit end'), { target: { value: '2030-01-01T11:00' } });
}
it('filters and paginates visits while preserving the linked lead filter', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/site-visits`, ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json({
        data: [visit],
        meta: {
          current_page: new URL(request.url).searchParams.get('page') === '2' ? 2 : 1,
          last_page: 2,
          total: 2,
        },
      });
    }),
  );
  app('/staff/site-visits?lead_id=12');
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Visit status' }),
    'scheduled',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Filter visits' }));
  await waitFor(() => expect(urls.at(-1)).toContain('status=scheduled'));
  await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  expect(urls.at(-1)).toContain('lead_id=12');
});
it('shows contact and audit history only after opening protected detail', async () => {
  app();
  await userEvent.click(await screen.findByRole('link', { name: visit.property_title }));
  expect(await screen.findByRole('heading', { name: 'Visit history' })).toBeInTheDocument();
  expect(screen.getByText(/buyer@example.test/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open linked lead' })).toHaveAttribute(
    'href',
    '/staff/leads/12',
  );
});
it('creates a visit using selected source records and ISO instants with only one submission', async () => {
  let calls = 0;
  server.use(
    http.post(`${base}/admin/site-visits`, async ({ request }) => {
      calls++;
      const data = (await request.json()) as Record<string, unknown>;
      expect(data).toMatchObject({ property_id: 7, lead_id: 12, user_id: 2 });
      expect(data.starts_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
      await delay(40);
      return HttpResponse.json({ data: visit }, { status: 201 });
    }),
  );
  app('/staff/site-visits/new');
  await createFields();
  const form = screen.getByRole('button', { name: 'Save visit' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(await screen.findByRole('heading', { name: 'Visit details' })).toBeInTheDocument();
  expect(calls).toBe(1);
});
it('retains the scheduling draft and source choices after a server conflict', async () => {
  server.use(
    http.post(`${base}/admin/site-visits`, () =>
      HttpResponse.json(
        {
          errors: { starts_at: ['Property, customer or agent already has an overlapping visit.'] },
        },
        { status: 422 },
      ),
    ),
  );
  app('/staff/site-visits/new');
  await createFields();
  await userEvent.type(screen.getByLabelText('Visit notes'), 'Keep this draft');
  await userEvent.click(screen.getByRole('button', { name: 'Save visit' }));
  expect(await screen.findByText(/overlapping visit/)).toBeInTheDocument();
  expect(screen.getByLabelText('Visit notes')).toHaveValue('Keep this draft');
  expect(screen.getByRole('combobox', { name: 'Lead choice' })).toHaveValue('12');
});
it('searches and pages source choices without dropping the selected record', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/properties`, ({ request }) => {
      urls.push(request.url);
      const next = new URL(request.url).searchParams.get('page') === '2';
      return HttpResponse.json({
        data: next
          ? [{ id: 8, title: 'Garden villa', city: 'Dandeli' }]
          : [{ id: 7, title: 'River home', city: 'Dandeli' }],
        meta: { current_page: next ? 2 : 1, last_page: 2, total: 2 },
      });
    }),
  );
  app('/staff/site-visits/new');
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Property choice' }),
    '7',
  );
  const section = screen.getByRole('heading', { name: 'Property' }).closest('div')!;
  await userEvent.click(within(section).getByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('option', { name: 'Garden villa · Dandeli' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Property choice' })).toHaveValue('7');
  await userEvent.type(screen.getByLabelText('Search properties'), 'Garden');
  await userEvent.click(screen.getByRole('button', { name: 'Search properties' }));
  await waitFor(() => expect(urls.at(-1)).toContain('q=Garden'));
});
it('requires exact permissions and avoids source endpoints when creation is forbidden', async () => {
  permissions(['visits', 'visits.view']);
  app('/staff/site-visits/new');
  expect(await screen.findByRole('alert')).toHaveTextContent('Scheduling needs');
  expect(screen.queryByRole('button', { name: 'Save visit' })).not.toBeInTheDocument();
});
it('allows a detail reader to see history without mutation controls or agent requests', async () => {
  permissions(['visits.view']);
  app('/staff/site-visits/31');
  expect(await screen.findByRole('heading', { name: 'Visit history' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Reschedule visit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save outcome' })).not.toBeInTheDocument();
});
it('handles scoped 404 honestly without showing cached private detail', async () => {
  server.use(
    http.get(`${base}/admin/site-visits/:id`, () => new HttpResponse(null, { status: 404 })),
  );
  app('/staff/site-visits/31');
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText(/buyer@example.test/)).not.toBeInTheDocument();
});
it('reschedules with an explicit reason and updates audit history', async () => {
  server.use(
    http.patch(`${base}/admin/site-visits/31/schedule`, async ({ request }) => {
      const data = (await request.json()) as Record<string, unknown>;
      expect(data.reason).toBe('Customer requested');
      expect(data.starts_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
      return HttpResponse.json({
        data: {
          ...visit,
          starts_at: data.starts_at,
          ends_at: data.ends_at,
          reschedule_count: 1,
          reschedule_reason: data.reason,
          events: [
            ...visit.events,
            {
              id: 2,
              actor_id: 1,
              action: 'rescheduled',
              changes: { reason: data.reason },
              created_at: '2026-11-01T10:00:00Z',
            },
          ],
        },
      });
    }),
  );
  app('/staff/site-visits/31');
  fireEvent.change(await screen.findByLabelText('Visit start'), {
    target: { value: '2030-01-01T12:00' },
  });
  fireEvent.change(screen.getByLabelText('Visit end'), { target: { value: '2030-01-01T13:00' } });
  await userEvent.type(screen.getByLabelText('Rescheduling reason'), 'Customer requested');
  await userEvent.click(screen.getByRole('button', { name: 'Save new schedule' }));
  expect(await screen.findByText('Visit rescheduled.')).toBeInTheDocument();
  expect(screen.getByText('Rescheduled')).toBeInTheDocument();
});
it('assigns an eligible visit agent through a narrow PATCH', async () => {
  server.use(
    http.patch(`${base}/admin/site-visits/31/assignment`, async ({ request }) => {
      expect(await request.json()).toEqual({ user_id: 2 });
      return HttpResponse.json({ data: { ...visit, user_id: 2 } });
    }),
  );
  app('/staff/site-visits/31');
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Visit agent choice' }),
    '2',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save visit assignment' }));
  expect(await screen.findByText('Visit assignment saved.')).toBeInTheDocument();
  expect(screen.getByText('Assigned agent #2')).toBeInTheDocument();
});
it.each(['completed', 'no_show', 'cancelled'])(
  'saves %s with the required outcome fields',
  async (status) => {
    server.use(
      http.patch(`${base}/admin/site-visits/31/status`, async ({ request }) => {
        const data = (await request.json()) as Record<string, unknown>;
        expect(data).toEqual(
          status === 'cancelled'
            ? { status, cancellation_reason: 'Customer cancelled' }
            : { status, feedback: 'Visit feedback' },
        );
        return HttpResponse.json({
          data: {
            ...visit,
            status,
            feedback: data.feedback || null,
            cancellation_reason: data.cancellation_reason || null,
          },
        });
      }),
    );
    app('/staff/site-visits/31');
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: 'Visit outcome' }),
      status,
    );
    await userEvent.type(
      screen.getByLabelText(status === 'cancelled' ? 'Cancellation reason' : 'Visit feedback'),
      status === 'cancelled' ? 'Customer cancelled' : 'Visit feedback',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save outcome' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Reschedule visit' })).not.toBeInTheDocument(),
    );
  },
);
it('edits completed visit feedback and keeps the draft on server validation errors', async () => {
  server.use(
    http.get(`${base}/admin/site-visits/:id`, () =>
      HttpResponse.json({ data: { ...visit, status: 'completed', feedback: 'Old feedback' } }),
    ),
    http.patch(`${base}/admin/site-visits/31/feedback`, () =>
      HttpResponse.json({ errors: { feedback: ['Cannot update this feedback'] } }, { status: 422 }),
    ),
  );
  app('/staff/site-visits/31');
  fireEvent.change(await screen.findByLabelText('Visit feedback'), {
    target: { value: 'New feedback' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save feedback' }));
  expect(await screen.findByText(/Cannot update this feedback/)).toBeInTheDocument();
  expect(screen.getByLabelText('Visit feedback')).toHaveValue('New feedback');
});
it('allows cancellation but disables completed/no-show choices before the visit starts', async () => {
  server.use(
    http.get(`${base}/admin/site-visits/:id`, () =>
      HttpResponse.json({
        data: { ...visit, starts_at: '2035-01-01T10:00:00Z', ends_at: '2035-01-01T11:00:00Z' },
      }),
    ),
  );
  app('/staff/site-visits/31');
  const outcome = await screen.findByRole('combobox', { name: 'Visit outcome' });
  expect(within(outcome).getByRole('option', { name: 'Completed' })).toBeDisabled();
  expect(within(outcome).getByRole('option', { name: 'No show' })).toBeDisabled();
  expect(within(outcome).getByRole('option', { name: 'Cancelled' })).toBeEnabled();
});
