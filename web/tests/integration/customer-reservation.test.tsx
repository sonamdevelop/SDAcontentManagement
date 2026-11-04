import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { CUSTOMER_TOKEN_KEY } from '../../src/customer/api';
import { customer } from '../customer-fixtures';
import { reservationQuote, reservedBooking } from '../reservation-fixtures';
const base = 'http://localhost:5173/api/v1/customer';
const server = setupServer(
  http.get(`${base}/me`, () => HttpResponse.json({ data: customer })),
  http.get(`${base}/rooms/2/availability`, () => HttpResponse.json({ data: reservationQuote })),
  http.get(`${base}/bookings/51`, () => HttpResponse.json({ data: reservedBooking })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app() {
  sessionStorage.setItem(CUSTOMER_TOKEN_KEY, 'customer-reservation');
  sessionStorage.setItem('sda.staff.token', 'staff-must-not-leak');
  return render(
    <MemoryRouter
      initialEntries={['/account/reserve?room_type_id=2']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
async function review() {
  const user = userEvent.setup();
  await screen.findByLabelText('Reservation check-in', { exact: true });
  await user.type(screen.getByLabelText('Reservation check-in', { exact: true }), '2030-01-01');
  await user.type(screen.getByLabelText('Reservation check-out', { exact: true }), '2030-01-03');
  await user.click(screen.getByRole('button', { name: 'Check room availability' }));
  await screen.findByLabelText('Reservation rooms', { exact: true });
  await user.clear(screen.getByLabelText('Reservation rooms', { exact: true }));
  await user.type(screen.getByLabelText('Reservation rooms', { exact: true }), '2');
  await user.clear(screen.getByLabelText('Reservation guests', { exact: true }));
  await user.type(screen.getByLabelText('Reservation guests', { exact: true }), '4');
  await user.click(screen.getByRole('button', { name: 'Review reservation' }));
  await screen.findByText('Reservation total: ₹4,001', { exact: true });
  return user;
}
it('reviews exact totals, reserves with only the customer bearer and opens the owned booking', async () => {
  let body: Record<string, unknown> | undefined;
  server.use(
    http.post(`${base}/bookings`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer customer-reservation');
      expect(request.credentials).toBe('omit');
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ data: reservedBooking }, { status: 201 });
    }),
  );
  app();
  const user = await review();
  await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
  await screen.findByRole('heading', { name: 'My booking #51' });
  expect(body).toMatchObject({
    rooms: 2,
    guests: 4,
    expected_rate: '1000.25',
    guest_name: customer.name,
  });
  expect(body).not.toHaveProperty('advance');
  expect(body).not.toHaveProperty('customer_id');
});
it('keeps the same frozen UUID across an uncertain response and a subsequent rate-limit rejection', async () => {
  const bodies: unknown[] = [];
  server.use(
    http.post(`${base}/bookings`, async ({ request }) => {
      bodies.push(await request.json());
      return bodies.length === 1
        ? HttpResponse.error()
        : bodies.length === 2
          ? HttpResponse.json({ message: 'Rate limit' }, { status: 429 })
          : HttpResponse.json({ data: reservedBooking });
    }),
  );
  app();
  const user = await review();
  await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
  await screen.findByRole('button', { name: 'Retry same reservation' });
  expect(screen.queryByRole('button', { name: 'Edit reservation' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry same reservation' }));
  await screen.findByText('Too many attempts. Please wait before trying again.');
  await user.click(screen.getByRole('button', { name: 'Retry same reservation' }));
  await screen.findByRole('heading', { name: 'My booking #51' });
  expect(bodies).toHaveLength(3);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(bodies[2]).toEqual(bodies[0]);
});
it('requires a new availability check after a definite rejection and never silently changes the price', async () => {
  server.use(
    http.post(`${base}/bookings`, () =>
      HttpResponse.json({ errors: { expected_rate: ['The room rate changed.'] } }, { status: 422 }),
    ),
  );
  app();
  const user = await review();
  await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
  await screen.findByText('expected rate: The room rate changed.');
  expect(screen.queryByRole('button', { name: 'Confirm reservation' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Check room availability' })).toBeInTheDocument();
});
it('does not submit reservations when capacity is exhausted', async () => {
  let posts = 0;
  server.use(
    http.get(`${base}/rooms/2/availability`, () =>
      HttpResponse.json({ data: { ...reservationQuote, available_rooms: 0 } }),
    ),
    http.post(`${base}/bookings`, () => {
      posts++;
      return HttpResponse.json({ data: reservedBooking }, { status: 201 });
    }),
  );
  app();
  await screen.findByLabelText('Reservation check-in', { exact: true });
  await userEvent.type(
    screen.getByLabelText('Reservation check-in', { exact: true }),
    '2030-01-01',
  );
  await userEvent.type(
    screen.getByLabelText('Reservation check-out', { exact: true }),
    '2030-01-03',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Check room availability' }));
  await screen.findByText('No rooms are available for these dates. Choose another range or room.');
  expect(posts).toBe(0);
});
it('treats a mismatched booking total in a success response as unresolved instead of confirming it', async () => {
  server.use(
    http.post(`${base}/bookings`, () =>
      HttpResponse.json(
        { data: { ...reservedBooking, total: '1.00', amount_due: '1.00', balance: '1.00' } },
        { status: 201 },
      ),
    ),
  );
  app();
  const user = await review();
  await user.click(screen.getByRole('button', { name: 'Confirm reservation' }));
  await screen.findByRole('button', { name: 'Retry same reservation' });
  expect(screen.queryByRole('heading', { name: 'My booking #51' })).not.toBeInTheDocument();
});
