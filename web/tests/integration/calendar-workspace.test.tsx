import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { calendar } from '../calendar-fixtures';
import { stay, stayMeta as meta } from '../stay-fixtures';
const base = 'http://localhost:5173/api/v1';
const server = setupServer(
  http.get(`${base}/auth/me`, () =>
    HttpResponse.json({
      data: {
        id: 1,
        name: 'Staff',
        email: 'staff@example.test',
        role: { name: 'Staff', permission_type: 'all', permissions: [] },
      },
    }),
  ),
  http.get(`${base}/admin/stays`, () => HttpResponse.json({ data: [stay], meta })),
  http.get(`${base}/admin/stay-rooms/2/calendar`, () => HttpResponse.json({ data: calendar })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/stay-calendar') {
  sessionStorage.setItem('sda.staff.token', 'calendar-token');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('loads private counts from URL state and refreshes allocation after a cancellation', async () => {
  let refresh = 0;
  server.use(
    http.get(`${base}/admin/stay-rooms/2/calendar`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer calendar-token');
      expect(request.credentials).toBe('omit');
      refresh++;
      return HttpResponse.json({
        data:
          refresh === 1
            ? calendar
            : {
                ...calendar,
                days: calendar.days.map((d) => ({
                  ...d,
                  occupied_rooms: 0,
                  available_rooms: 2,
                  bookable: d.date >= calendar.today,
                })),
              },
      });
    }),
  );
  app('/staff/stay-calendar?room_type_id=2&from=2030-01-01&to=2030-01-04');
  await screen.findByRole('table', { name: 'Nightly room availability' });
  const row = screen.getByRole('rowheader', { name: '2030-01-02' }).closest('tr')!;
  expect(within(row).getByText('Full')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh calendar' }));
  await waitFor(() => expect(screen.queryByText('Full')).not.toBeInTheDocument());
  expect(screen.getAllByText('Available')).toHaveLength(3);
});
it('preserves dates and selected room across paginated room choices before submitting', async () => {
  server.use(
    http.get(`${base}/admin/stays`, ({ request }) =>
      HttpResponse.json({
        data:
          new URL(request.url).searchParams.get('page') === '2'
            ? [
                {
                  ...stay,
                  id: 3,
                  name: 'Other stay',
                  rooms: [{ ...stay.rooms[0], id: 4, stay_id: 3 }],
                },
              ]
            : [stay],
        meta: {
          current_page: new URL(request.url).searchParams.get('page') === '2' ? 2 : 1,
          last_page: 2,
          total: 2,
        },
      }),
    ),
  );
  app();
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Calendar room type' }),
    '2',
  );
  fireEvent.change(screen.getByLabelText('Calendar from'), { target: { value: '2030-01-01' } });
  fireEvent.change(screen.getByLabelText('Calendar to (exclusive)'), {
    target: { value: '2030-01-04' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('option', { name: /Other stay/ });
  expect(screen.getByRole('combobox', { name: 'Calendar room type' })).toHaveValue('2');
  await userEvent.click(screen.getByRole('button', { name: 'Show calendar' }));
  await screen.findByRole('table', { name: 'Nightly room availability' });
});
it('rejects oversized ranges and malformed data without showing misleading availability', async () => {
  app('/staff/stay-calendar?room_type_id=2&from=2030-01-01&to=2031-01-01');
  await screen.findByRole('button', { name: 'Retry calendar' });
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
