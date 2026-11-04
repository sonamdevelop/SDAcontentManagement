import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { stay, stayMeta } from '../stay-fixtures';
import { stayReport, stayReportStaff, reportPath } from '../stay-report-fixtures';
const base = 'http://localhost:5173/api/v1';
const server = setupServer(
  http.get(base + '/auth/me', () => HttpResponse.json({ data: stayReportStaff })),
  http.get(base + '/admin/stays', () => HttpResponse.json({ data: [stay], meta: stayMeta })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = reportPath) {
  sessionStorage.setItem('sda.staff.token', 'finance-token');
  sessionStorage.setItem('sda.customer.token', 'customer-secret');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('shows scoped nights, over-capacity warning and separated currencies using staff credentials', async () => {
  server.use(
    http.get(base + '/admin/stays/1/report', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer finance-token');
      expect(new URL(request.url).searchParams.get('to')).toBe('2030-01-04');
      return HttpResponse.json(stayReport);
    }),
  );
  app();
  await screen.findByRole('heading', { name: 'Offline cash movement' });
  expect(screen.getByText(/Net movement: -60.01/)).toBeInTheDocument();
  expect(screen.getByText('INR 400.04')).toBeInTheDocument();
  expect(screen.getByText('USD 20.01')).toBeInTheDocument();
  expect(screen.getByText(/2030-01-03: 3 \/ 2 rooms · Above current capacity/)).toBeInTheDocument();
  expect(screen.getByLabelText('Report from')).toHaveValue('2030-01-02');
});
it('fails closed on inconsistent totals and allows retry', async () => {
  server.use(
    http.get(base + '/admin/stays/1/report', () =>
      HttpResponse.json({
        ...stayReport,
        summary: { ...stayReport.summary, booked_room_nights: 99 },
      }),
    ),
  );
  app();
  await screen.findByRole('alert');
  expect(screen.queryByRole('heading', { name: 'Offline cash movement' })).not.toBeInTheDocument();
  server.use(http.get(base + '/admin/stays/1/report', () => HttpResponse.json(stayReport)));
  await userEvent.click(screen.getByRole('button', { name: 'Retry stay report' }));
  await screen.findByRole('heading', { name: 'Offline cash movement' });
});
it('does not request finance data without ledger permission', async () => {
  server.use(
    http.get(base + '/auth/me', () =>
      HttpResponse.json({
        data: {
          ...stayReportStaff,
          role: {
            ...stayReportStaff.role,
            permissions: ['stays', 'stay-bookings', 'stay-bookings.view'],
          },
        },
      }),
    ),
  );
  app();
  await screen.findByText(/Stay analytics needs/);
  expect(screen.queryByRole('heading', { name: 'Offline cash movement' })).not.toBeInTheDocument();
});
it('updates date filters from the form and displays empty results', async () => {
  server.use(
    http.get(base + '/admin/stays/1/report', () =>
      HttpResponse.json({
        ...stayReport,
        summary: { booked_room_nights: 0, inventory_room_nights: 4, confirmed_bookings: 0 },
        days: stayReport.days.map((d) => ({ ...d, booked_rooms: 0, over_capacity: false })),
        booked_value: [],
        cash_movement: [],
      }),
    ),
  );
  app('/staff/stay-reports');
  await screen.findByRole('option', { name: 'River stay · Dandeli' });
  await userEvent.selectOptions(screen.getByLabelText('Report stay'), '1');
  await userEvent.type(screen.getByLabelText('Report from'), '2030-01-02');
  await userEvent.type(screen.getByLabelText('Report until (exclusive)'), '2030-01-04');
  await userEvent.click(screen.getByRole('button', { name: 'Show stay report' }));
  await screen.findByText('No visible ledger movements in this range.');
});
