import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { lead, task, pipelines, meta } from '../lead-fixtures';
const base = 'http://localhost:5173/api/v1';
const all = {
  id: 1,
  name: 'Asha',
  email: 'staff@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: all })),
  http.get(`${base}/admin/leads/:id`, ({ params }) =>
    HttpResponse.json({ data: { ...lead, id: Number(params.id) } }),
  ),
  http.get(`${base}/admin/lead-assignees`, () =>
    HttpResponse.json({ data: [{ id: 2, name: 'Ravi' }], meta }),
  ),
  http.get(`${base}/admin/lead-pipelines`, () => HttpResponse.json({ data: pipelines })),
  http.get(`${base}/admin/leads/:id/follow-ups`, () => HttpResponse.json({ data: [task], meta })),
  http.get(`${base}/admin/follow-ups`, () => HttpResponse.json({ data: [task], meta })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/leads/12') {
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
        data: { ...all, role: { name: 'Custom', permission_type: 'custom', permissions: values } },
      }),
    ),
  );
}
it('opens private detail from a linked enquiry and renders the buyer contact safely', async () => {
  server.use(
    http.get(`${base}/admin/enquiries`, () =>
      HttpResponse.json({
        data: [
          {
            id: 1,
            property_title: 'River home',
            name: 'Buyer',
            email: 'buyer@example.test',
            phone: null,
            message: 'Interested',
            lead_id: 12,
            created_at: '2026-11-01',
          },
        ],
        meta,
      }),
    ),
  );
  app('/staff/enquiries');
  await userEvent.click(await screen.findByRole('link', { name: 'Open lead #12' }));
  expect(await screen.findByRole('heading', { name: lead.title })).toBeInTheDocument();
  expect(screen.getByText('buyer@example.test')).toBeInTheDocument();
  expect(await screen.findByText(/Overdue ·/)).toBeInTheDocument();
});
it('assigns from paginated eligible agents and refreshes the displayed owner', async () => {
  server.use(
    http.get(`${base}/admin/lead-assignees`, ({ request }) => {
      const page = new URL(request.url).searchParams.get('page');
      return HttpResponse.json({
        data: page === '2' ? [{ id: 3, name: 'Meera' }] : [{ id: 2, name: 'Ravi' }],
        meta: { current_page: Number(page), last_page: 2, total: 2 },
      });
    }),
    http.patch(`${base}/admin/leads/12/assignment`, async ({ request }) => {
      expect(await request.json()).toEqual({ user_id: 3 });
      return HttpResponse.json({ data: { ...lead, agent: { id: 3, name: 'Meera' }, user_id: 3 } });
    }),
  );
  app();
  const section = (await screen.findByRole('heading', { name: 'Assign agent' })).closest(
    'section',
  )!;
  await userEvent.click(await within(section).findByRole('button', { name: 'Next' }));
  await userEvent.selectOptions(await within(section).findByLabelText('New agent'), '3');
  await userEvent.click(within(section).getByRole('button', { name: 'Save assignment' }));
  expect(await screen.findByText('Agent assignment saved.')).toBeInTheDocument();
  expect(screen.getByText(/Current: Meera/)).toBeInTheDocument();
});
it('restricts choices to the current pipeline and supplies lost reason for a lost stage', async () => {
  server.use(
    http.patch(`${base}/admin/leads/12/stage`, async ({ request }) => {
      expect(await request.json()).toEqual({
        lead_pipeline_stage_id: 3,
        lost_reason: 'Budget mismatch',
      });
      return HttpResponse.json({
        data: {
          ...lead,
          stage: { id: 3, name: 'Lost', code: 'lost' },
          lost_reason: 'Budget mismatch',
        },
      });
    }),
  );
  app();
  const select = await screen.findByLabelText('New stage');
  expect(within(select).queryByText('Other stage')).not.toBeInTheDocument();
  await userEvent.selectOptions(select, '3');
  await userEvent.type(screen.getByLabelText('Lost reason'), 'Budget mismatch');
  await userEvent.click(screen.getByRole('button', { name: 'Save stage' }));
  expect(await screen.findByText('Lead stage saved.')).toBeInTheDocument();
  expect(screen.getByText('Lost reason: Budget mismatch')).toBeInTheDocument();
});
it('keeps stage draft and reports backend validation failures', async () => {
  server.use(
    http.patch(`${base}/admin/leads/12/stage`, () =>
      HttpResponse.json(
        { errors: { lead_pipeline_stage_id: ['Stage no longer available'] } },
        { status: 422 },
      ),
    ),
  );
  app();
  await userEvent.selectOptions(await screen.findByLabelText('New stage'), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Save stage' }));
  expect(await screen.findByText(/Stage no longer available/)).toBeInTheDocument();
  expect(screen.getByLabelText('New stage')).toHaveValue('2');
});
it('requires exact view/edit/assignment permissions and avoids private option requests for readers', async () => {
  permissions(['leads.view']);
  app();
  expect(await screen.findByRole('heading', { name: lead.title })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Assign agent' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('New activity type')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('New stage')).not.toBeInTheDocument();
});
it('denies lead detail without leads.view', async () => {
  permissions(['leads', 'leads.edit', 'leads.assign']);
  app();
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
});
it('adds a plain text note with a single request despite repeated submission', async () => {
  let calls = 0;
  server.use(
    http.post(`${base}/admin/leads/12/follow-ups`, async ({ request }) => {
      calls++;
      expect(await request.json()).toEqual({
        type: 'note',
        comment: '<script>plain text</script>',
      });
      await delay(50);
      return HttpResponse.json(
        {
          data: {
            ...task,
            id: 23,
            type: 'note',
            title: null,
            comment: '<script>plain text</script>',
            due_at: null,
            is_done: true,
            is_overdue: false,
          },
        },
        { status: 201 },
      );
    }),
  );
  app();
  await userEvent.type(await screen.findByLabelText('Note text'), '<script>plain text</script>');
  const form = screen.getByRole('button', { name: 'Add note' }).closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(await screen.findByText('Note added.')).toBeInTheDocument();
  expect(calls).toBe(1);
  expect(screen.getByLabelText('Note text')).toHaveValue('');
});
it('creates follow-ups with explicit time zone instants and can mark them done', async () => {
  let done = false;
  server.use(
    http.post(`${base}/admin/leads/12/follow-ups`, async ({ request }) => {
      const data = (await request.json()) as Record<string, unknown>;
      expect(data).toMatchObject({ type: 'task', title: 'Call tomorrow' });
      expect(data.due_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
      return HttpResponse.json({ data: task }, { status: 201 });
    }),
    http.patch(`${base}/admin/leads/12/follow-ups/22`, async ({ request }) => {
      expect(await request.json()).toEqual({ is_done: true });
      done = true;
      return HttpResponse.json({ data: { ...task, is_done: true, is_overdue: false } });
    }),
    http.get(`${base}/admin/leads/12/follow-ups`, () =>
      HttpResponse.json({ data: [{ ...task, is_done: done, is_overdue: !done }], meta }),
    ),
  );
  app();
  await userEvent.selectOptions(await screen.findByLabelText('New activity type'), 'task');
  await userEvent.type(screen.getByLabelText('Task title'), 'Call tomorrow');
  fireEvent.change(screen.getByLabelText('Due date and time'), {
    target: { value: '2026-12-14T10:30' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Add follow-up' }));
  expect(await screen.findByText('Follow-up added.')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: 'Mark done' }));
  expect(await screen.findByRole('button', { name: 'Mark pending' })).toBeInTheDocument();
});
it('retains failed note drafts and handles a forbidden mutation honestly', async () => {
  server.use(
    http.post(`${base}/admin/leads/12/follow-ups`, () => new HttpResponse(null, { status: 403 })),
  );
  app();
  await userEvent.type(await screen.findByLabelText('Note text'), 'Keep this note');
  await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
  expect(screen.getByLabelText('Note text')).toHaveValue('Keep this note');
});
it('filters and paginates the global overdue queue and links back to leads', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/follow-ups`, ({ request }) => {
      urls.push(request.url);
      const page = new URL(request.url).searchParams.get('page');
      return HttpResponse.json({
        data: [task],
        meta: { current_page: page === '2' ? 2 : 1, last_page: 2, total: 2 },
      });
    }),
  );
  app('/staff/follow-ups');
  await userEvent.selectOptions(await screen.findByLabelText('Activity type'), 'task');
  await userEvent.click(screen.getByLabelText('Overdue tasks only'));
  await userEvent.click(screen.getByRole('button', { name: 'Filter activities' }));
  await waitFor(() => expect(urls.at(-1)).toContain('overdue=1'));
  await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  expect(screen.getByRole('link', { name: 'Open lead #12' })).toHaveAttribute(
    'href',
    '/staff/leads/12',
  );
});
it('edits a task and reschedules it without changing its type', async () => {
  server.use(
    http.patch(`${base}/admin/leads/12/follow-ups/22`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ title: 'Call next week', comment: task.comment });
      expect(body).not.toHaveProperty('type');
      expect(body.due_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
      return HttpResponse.json({ data: { ...task, ...body } });
    }),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit task' }));
  fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Call next week' } });
  fireEvent.change(screen.getByLabelText('Due date and time'), {
    target: { value: '2026-12-21T14:00' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save activity' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save activity' })).not.toBeInTheDocument(),
  );
});
it('edits a note as plain text without changing the activity type', async () => {
  const note = {
    ...task,
    id: 23,
    type: 'note',
    title: null,
    comment: 'Original note',
    due_at: null,
    is_done: true,
    is_overdue: false,
  };
  server.use(
    http.get(`${base}/admin/leads/12/follow-ups`, () => HttpResponse.json({ data: [note], meta })),
    http.patch(`${base}/admin/leads/12/follow-ups/23`, async ({ request }) => {
      expect(await request.json()).toEqual({ comment: 'Edited note' });
      return HttpResponse.json({ data: { ...note, comment: 'Edited note' } });
    }),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit note' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Note text' }), {
    target: { value: 'Edited note' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save activity' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Save activity' })).not.toBeInTheDocument(),
  );
});
