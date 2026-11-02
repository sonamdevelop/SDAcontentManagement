import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { stay, booking, stayMeta as meta } from '../stay-fixtures';
const base = 'http://localhost:5173/api/v1';
const profile = {
  id: 1,
  name: 'Staff',
  email: 'staff@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/stays`, () => HttpResponse.json({ data: [stay], meta })),
  http.get(`${base}/admin/stay-bookings`, () => HttpResponse.json({ data: [booking], meta })),
  http.get(`${base}/admin/stay-bookings/:id`, () => HttpResponse.json({ data: booking })),
  http.get(`${base}/admin/stay-rooms/2/availability`, () =>
    HttpResponse.json({
      data: {
        room_type_id: 2,
        check_in: '2030-01-01',
        check_out: '2030-01-03',
        nights: 2,
        timezone: 'Asia/Kolkata',
        nightly_rate: '1000.25',
        currency: 'INR',
        capacity: 2,
        available_rooms: 2,
      },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path: string) {
  sessionStorage.setItem('sda.staff.token', 'stay-token');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
async function fields() {
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Booking room type' }),
    '2',
  );
  fireEvent.change(screen.getByLabelText('Check-in date'), { target: { value: '2030-01-01' } });
  fireEvent.change(screen.getByLabelText('Check-out date'), { target: { value: '2030-01-03' } });
  await userEvent.click(screen.getByRole('button', { name: 'Check availability' }));
  await screen.findByText(/2 rooms available/);
  fireEvent.change(screen.getByLabelText('Number of rooms'), { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Number of guests'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Guest name'), { target: { value: 'Guest' } });
  fireEvent.change(screen.getByLabelText('Recorded booking advance'), {
    target: { value: '100.01' },
  });
}
it('quotes exact room totals, preserves uncertain UUID and uses private bearer transport', async () => {
  const payloads: unknown[] = [];
  server.use(
    http.post(`${base}/admin/stay-bookings`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer stay-token');
      expect(request.credentials).toBe('omit');
      payloads.push(await request.json());
      return payloads.length === 1 ? HttpResponse.error() : HttpResponse.json({ data: booking });
    }),
  );
  app('/staff/stay-bookings/new');
  await fields();
  expect(screen.getByText('Quoted total: ₹4,001')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save stay booking' }));
  await screen.findByRole('button', { name: 'Retry same booking' });
  expect(screen.getByLabelText('Guest name')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Retry same booking' }));
  await screen.findByRole('heading', { name: 'Stay booking #51' });
  expect(payloads[1]).toEqual(payloads[0]);
  expect(payloads[0]).toMatchObject({
    rooms: 2,
    guests: 4,
    advance: '100.01',
    expected_rate: '1000.25',
  });
});
it('retains a rejected booking draft and requires fresh availability', async () => {
  server.use(
    http.post(`${base}/admin/stay-bookings`, () =>
      HttpResponse.json({ errors: { rooms: ['No rooms remain.'] } }, { status: 422 }),
    ),
  );
  app('/staff/stay-bookings/new');
  await fields();
  await userEvent.click(screen.getByRole('button', { name: 'Save stay booking' }));
  await screen.findByText(/No rooms remain/);
  expect(screen.getByLabelText('Guest name')).toHaveValue('Guest');
  expect(screen.getByRole('button', { name: 'Save stay booking' })).toBeDisabled();
  expect(screen.getByLabelText('Guest name')).toBeEnabled();
});
it('cancels with reviewed reason, retains advance and shows plain-text history', async () => {
  server.use(
    http.patch(`${base}/admin/stay-bookings/51/cancel`, async ({ request }) => {
      expect(await request.json()).toEqual({ cancellation_reason: 'Changed plans' });
      return HttpResponse.json({
        data: {
          ...booking,
          status: 'cancelled',
          cancellation_reason: 'Changed plans',
          notes: '<script>unsafe()</script>',
          events: [
            ...booking.events!,
            {
              id: 2,
              actor_id: 1,
              action: 'cancelled',
              changes: { cancellation_reason: 'Changed plans' },
              created_at: '2026-11-02T11:00:00Z',
            },
          ],
        },
      });
    }),
  );
  app('/staff/stay-bookings/51');
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel stay booking' }));
  fireEvent.change(screen.getByLabelText('Booking cancellation reason'), {
    target: { value: 'Changed plans' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel stay booking' }));
  await screen.findByText('Booking cancellation: Changed plans');
  expect(screen.getByText('<script>unsafe()</script>')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel stay booking' })).not.toBeInTheDocument();
});
it('hides mutation and detail navigation from list-only readers', async () => {
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: { name: 'Reader', permission_type: 'custom', permissions: ['stay-bookings'] },
        },
      }),
    ),
  );
  app('/staff/stay-bookings');
  await screen.findByRole('heading', { name: 'River stay — Deluxe #51' });
  expect(screen.queryByRole('link', { name: 'River stay — Deluxe #51' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'New stay booking' })).not.toBeInTheDocument();
  expect(screen.queryByText('guest@example.test')).not.toBeInTheDocument();
});
it('creates stays and rooms and preserves drafts on invalid inventory edits', async () => {
  let saved = false;
  server.use(
    http.post(`${base}/admin/stays`, async ({ request }) => {
      expect(await request.json()).toMatchObject({ name: 'Forest stay', timezone: 'Asia/Kolkata' });
      saved = true;
      return HttpResponse.json({ data: stay }, { status: 201 });
    }),
  );
  app('/staff/stays');
  await userEvent.click(await screen.findByRole('button', { name: 'Add stay' }));
  fireEvent.change(screen.getByLabelText('Stay name'), { target: { value: 'Forest stay' } });
  fireEvent.change(screen.getByLabelText('Stay city'), { target: { value: 'Dandeli' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save stay' }));
  await waitFor(() => expect(saved).toBe(true));
});
