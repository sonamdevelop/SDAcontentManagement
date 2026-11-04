import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { customer } from '../customer-fixtures';
import { reservedBooking } from '../reservation-fixtures';
import {
  cancellation,
  reviewedCancellation,
  cancellationMeta,
  cancellationStaff,
} from '../cancellation-fixtures';
const base = 'http://localhost:5173/api/v1';
const server = setupServer(
  http.get(base + '/customer/me', () => HttpResponse.json({ data: customer })),
  http.get(base + '/auth/me', () => HttpResponse.json({ data: cancellationStaff })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path: string) {
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  sessionStorage.setItem('sda.staff.token', 'staff-private');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('reviews a customer cancellation and retries the same UUID after an uncertain response before showing pending history', async () => {
  const bodies: unknown[] = [];
  let submitted = false;
  server.use(
    http.get(base + '/customer/bookings/51', () =>
      HttpResponse.json({
        data: { ...reservedBooking, cancellation_requests: submitted ? [cancellation] : [] },
      }),
    ),
    http.post(base + '/customer/bookings/51/cancellation-requests', async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-private');
      expect(request.credentials).toBe('omit');
      bodies.push(await request.json());
      submitted = true;
      return bodies.length === 1 ? HttpResponse.error() : HttpResponse.json({ data: cancellation });
    }),
  );
  app('/account/bookings/51');
  const u = userEvent.setup();
  await screen.findByLabelText('Cancellation request reason');
  await u.type(screen.getByLabelText('Cancellation request reason'), cancellation.reason);
  await u.click(screen.getByRole('button', { name: 'Review cancellation request' }));
  expect(bodies).toHaveLength(0);
  await u.click(screen.getByRole('button', { name: 'Send cancellation request' }));
  await screen.findByRole('button', { name: 'Retry same cancellation request' });
  expect(
    screen.queryByRole('button', { name: 'Edit cancellation request' }),
  ).not.toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Retry same cancellation request' }));
  await screen.findByRole('heading', { name: 'Request #8: Pending' });
  expect(bodies[1]).toEqual(bodies[0]);
  expect(screen.queryByLabelText('Cancellation request reason')).not.toBeInTheDocument();
});
it('approves only after staff review and freezes the original decision for an uncertain retry', async () => {
  const bodies: unknown[] = [];
  let done = false;
  server.use(
    http.get(base + '/admin/stay-cancellation-requests', () =>
      HttpResponse.json({
        data: done ? [] : [cancellation],
        meta: { ...cancellationMeta, total: done ? 0 : 1 },
      }),
    ),
    http.patch(base + '/admin/stay-cancellation-requests/8/decision', async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer staff-private');
      bodies.push(await request.json());
      if (bodies.length === 1) return HttpResponse.error();
      done = true;
      return HttpResponse.json({ data: reviewedCancellation });
    }),
  );
  app('/staff/stay-cancellation-requests');
  const u = userEvent.setup();
  await screen.findByLabelText('Customer-visible decision reason');
  await u.type(
    screen.getByLabelText('Customer-visible decision reason'),
    reviewedCancellation.decision_reason!,
  );
  await u.click(screen.getByRole('button', { name: 'Review cancellation decision' }));
  expect(bodies).toHaveLength(0);
  await u.click(screen.getByRole('button', { name: 'Confirm cancellation decision' }));
  await screen.findByRole('button', { name: 'Retry same cancellation decision' });
  expect(
    screen.queryByRole('button', { name: 'Edit cancellation decision' }),
  ).not.toBeInTheDocument();
  await u.click(screen.getByRole('button', { name: 'Retry same cancellation decision' }));
  await screen.findByText('No cancellation requests match these filters.');
  expect(bodies[1]).toEqual(bodies[0]);
});
it('keeps queue readers read-only and preserves rejected booking filters', async () => {
  server.use(
    http.get(base + '/auth/me', () =>
      HttpResponse.json({
        data: {
          ...cancellationStaff,
          role: {
            name: 'Reader',
            permission_type: 'custom',
            permissions: ['stay-bookings', 'stay-bookings.view'],
          },
        },
      }),
    ),
    http.get(base + '/admin/stay-cancellation-requests', ({ request }) => {
      const u = new URL(request.url);
      expect(u.searchParams.get('booking_id')).toBe('51');
      expect(u.searchParams.get('status')).toBe('rejected');
      return HttpResponse.json({
        data: [{ ...reviewedCancellation, status: 'rejected' }],
        meta: cancellationMeta,
      });
    }),
  );
  app('/staff/stay-cancellation-requests?booking_id=51&status=rejected');
  await screen.findByText('Customer reason: Travel plans changed');
  expect(screen.queryByLabelText('Customer-visible decision reason')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Request status')).toHaveValue('rejected');
});
it('rejects malformed decision data without reporting completion', async () => {
  server.use(
    http.get(base + '/admin/stay-cancellation-requests', () =>
      HttpResponse.json({ data: [cancellation], meta: cancellationMeta }),
    ),
    http.patch(base + '/admin/stay-cancellation-requests/8/decision', () =>
      HttpResponse.json({ data: { ...reviewedCancellation, status: 'rejected' } }),
    ),
  );
  app('/staff/stay-cancellation-requests');
  const u = userEvent.setup();
  await screen.findByLabelText('Customer-visible decision reason');
  await u.type(
    screen.getByLabelText('Customer-visible decision reason'),
    reviewedCancellation.decision_reason!,
  );
  await u.click(screen.getByRole('button', { name: 'Review cancellation decision' }));
  await u.click(screen.getByRole('button', { name: 'Confirm cancellation decision' }));
  await screen.findByRole('button', { name: 'Retry same cancellation decision' });
  expect(
    screen.queryByText('No cancellation requests match these filters.'),
  ).not.toBeInTheDocument();
});
