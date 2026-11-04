import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import {
  moderationDetail,
  approvedModeration,
  moderationStaff,
  moderationRow,
  moderationMeta,
} from '../moderation-fixtures';
const base = 'http://localhost:5173/api/v1',
  url = base + '/admin/properties/7/moderation';
const server = setupServer(
  http.get(base + '/auth/me', () => HttpResponse.json({ data: moderationStaff })),
  http.get(url, () => HttpResponse.json({ data: moderationDetail })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/properties/7/moderation') {
  sessionStorage.setItem('sda.staff.token', 'reviewer-private');
  sessionStorage.setItem('sda.customer.token', 'customer-must-stay-private');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('reviews the exact content revision and freezes approval through an uncertain retry', async () => {
  const bodies: unknown[] = [];
  server.use(
    http.patch(url, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer reviewer-private');
      expect(request.credentials).toBe('omit');
      bodies.push(await request.json());
      return bodies.length === 1
        ? HttpResponse.error()
        : HttpResponse.json({ data: approvedModeration });
    }),
  );
  app();
  const u = userEvent.setup();
  await screen.findByLabelText('Moderation reason');
  await u.type(screen.getByLabelText('Moderation reason'), 'Reviewed listing');
  await u.click(screen.getByRole('button', { name: 'Review moderation decision' }));
  expect(bodies).toHaveLength(0);
  expect(screen.getByText('Property #7 · Revision 1 · River view apartment')).toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Confirm moderation action' }));
  await screen.findByRole('button', { name: 'Retry same moderation action' });
  expect(screen.queryByRole('button', { name: 'Edit moderation action' })).not.toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Retry same moderation action' }));
  await screen.findByText('Moderation: Approved · Revision 1');
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[0]).toEqual({
    expected_revision: 1,
    reason: 'Reviewed listing',
    decision: 'approved',
  });
});
it('blocks stale decisions and requires refresh before reviewing the next revision', async () => {
  let changed = false;
  server.use(
    http.get(url, () =>
      HttpResponse.json({
        data: changed
          ? {
              ...moderationDetail,
              moderation_revision: 2,
              listing: { ...moderationDetail.listing, title: 'Changed listing' },
            }
          : moderationDetail,
      }),
    ),
    http.patch(url, () => {
      changed = true;
      return HttpResponse.json({ message: 'Conflict' }, { status: 409 });
    }),
  );
  app();
  const u = userEvent.setup();
  await screen.findByLabelText('Moderation reason');
  await u.type(screen.getByLabelText('Moderation reason'), 'Reviewed listing');
  await u.click(screen.getByRole('button', { name: 'Review moderation decision' }));
  await u.click(screen.getByRole('button', { name: 'Confirm moderation action' }));
  await screen.findByText(/Refresh this listing before another action/);
  expect(screen.queryByLabelText('Moderation reason')).not.toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Refresh listing review' }));
  await screen.findByText('Moderation: Pending · Revision 2');
  await screen.findByLabelText('Moderation reason');
});
it('allows editors to resubmit rejected content without granting moderation authority', async () => {
  const rejected = {
    ...moderationDetail,
    moderation_status: 'rejected',
    moderation_reason: 'Needs more detail',
    moderated_at: '2026-11-04T09:00:00Z',
  };
  server.use(
    http.get(base + '/auth/me', () =>
      HttpResponse.json({
        data: {
          ...moderationStaff,
          role: {
            name: 'Editor',
            permission_type: 'custom',
            permissions: ['properties', 'properties.edit'],
          },
        },
      }),
    ),
    http.get(url, () => HttpResponse.json({ data: rejected })),
    http.post(url + '/submit', async ({ request }) => {
      expect(await request.json()).toEqual({ expected_revision: 1, reason: 'Please reconsider' });
      return HttpResponse.json({ data: { ...moderationDetail, moderation_revision: 2 } });
    }),
  );
  app();
  const u = userEvent.setup();
  await screen.findByLabelText('Resubmission note');
  expect(screen.queryByLabelText('Moderation decision')).not.toBeInTheDocument();
  await u.type(screen.getByLabelText('Resubmission note'), 'Please reconsider');
  await u.click(screen.getByRole('button', { name: 'Review resubmission' }));
  await u.click(screen.getByRole('button', { name: 'Confirm moderation action' }));
  await screen.findByText('Moderation: Pending · Revision 2');
  expect(screen.queryByLabelText('Moderation reason')).not.toBeInTheDocument();
});
it('shows read-only snapshots and history to property readers', async () => {
  server.use(
    http.get(base + '/auth/me', () =>
      HttpResponse.json({
        data: {
          ...moderationStaff,
          role: { name: 'Reader', permission_type: 'custom', permissions: ['properties'] },
        },
      }),
    ),
  );
  app();
  await screen.findByText('Current public content');
  expect(
    screen.queryByRole('button', { name: 'Review moderation decision' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Edit listing content' })).not.toBeInTheDocument();
  expect(screen.getByText('Moderation history')).toBeInTheDocument();
});
it('keeps queue filters in URLs and rejects malformed decision success data', async () => {
  server.use(
    http.get(base + '/admin/property-moderation', ({ request }) => {
      const p = new URL(request.url).searchParams;
      expect(p.get('status')).toBe('pending');
      expect(p.get('property_id')).toBe('7');
      return HttpResponse.json({ data: [moderationRow], meta: moderationMeta });
    }),
    http.patch(url, () =>
      HttpResponse.json({ data: { ...approvedModeration, moderation_revision: 2 } }),
    ),
  );
  app('/staff/property-moderation?status=pending&property_id=7');
  const u = userEvent.setup();
  await screen.findByRole('link', { name: 'River view apartment' });
  expect(screen.getByLabelText('Moderation property ID')).toHaveValue('7');
  await u.click(screen.getByRole('link', { name: 'River view apartment' }));
  await screen.findByLabelText('Moderation reason');
  await u.type(screen.getByLabelText('Moderation reason'), 'Reviewed listing');
  await u.click(screen.getByRole('button', { name: 'Review moderation decision' }));
  await u.click(screen.getByRole('button', { name: 'Confirm moderation action' }));
  await screen.findByRole('button', { name: 'Retry same moderation action' });
  expect(screen.queryByText('Moderation: Approved · Revision 1')).not.toBeInTheDocument();
});
