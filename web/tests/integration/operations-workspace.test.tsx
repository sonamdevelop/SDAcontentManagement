import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { stay, stayMeta as meta } from '../stay-fixtures';
import { operations } from '../operations-fixtures';
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
  http.get(`${base}/admin/stays/1/operations`, () => HttpResponse.json(operations)),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/stay-operations?stay_id=1&date=2030-01-02&view=arrivals') {
  sessionStorage.setItem('sda.staff.token', 'operations-token');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('shows selected-date queues and switches to live overdue attendance with retained date and pagination', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/stays/1/operations`, ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer operations-token');
      expect(request.credentials).toBe('omit');
      urls.push(request.url);
      const p = new URL(request.url).searchParams;
      return HttpResponse.json({
        ...operations,
        context: { ...operations.context, view: p.get('view') || 'arrivals' },
        meta: { current_page: Number(p.get('page') || 1), last_page: 2, total: 2 },
      });
    }),
  );
  app();
  await screen.findByRole('link', { name: 'Operations guest — Deluxe #51' });
  await userEvent.click(screen.getByRole('button', { name: 'Overdue check-outs now (1)' }));
  await screen.findByText(/Live attendance as of/);
  await waitFor(() => expect(urls.at(-1)).toContain('view=overdue'));
  expect(urls.at(-1)).toContain('date=2030-01-02');
  const next = screen
    .getAllByRole('button', { name: 'Next' })
    .find((b) => !b.hasAttribute('disabled'))!;
  await userEvent.click(next);
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  expect(urls.at(-1)).toContain('view=overdue');
});
it('refreshes operational counts after staff record a departure', async () => {
  let calls = 0;
  server.use(
    http.get(`${base}/admin/stays/1/operations`, () => {
      calls++;
      return HttpResponse.json(
        calls === 1
          ? operations
          : {
              ...operations,
              data: [],
              meta: { ...meta, total: 0 },
              context: {
                ...operations.context,
                counts: { arrivals: 1, departures: 0, in_house: 0, overdue: 0 },
              },
            },
      );
    }),
  );
  app();
  await screen.findByRole('button', { name: 'In house now (1)' });
  await userEvent.click(screen.getByRole('button', { name: 'Refresh operations' }));
  await screen.findByRole('button', { name: 'In house now (0)' });
  expect(screen.getByText('No bookings in this operations queue.')).toBeInTheDocument();
});
it('does not load guest queues for users without booking detail permissions', async () => {
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: {
            name: 'Reader',
            permission_type: 'custom',
            permissions: ['stays', 'stay-bookings'],
          },
        },
      }),
    ),
  );
  app();
  await screen.findByText('Operations needs stay access and booking list/detail permissions.');
  expect(screen.queryByText(/Operations guest/)).not.toBeInTheDocument();
});
it('refuses malformed operational rows instead of showing inconsistent attendance', async () => {
  server.use(
    http.get(`${base}/admin/stays/1/operations`, () =>
      HttpResponse.json({ ...operations, data: [{ ...operations.data[0], guests: 'two' }] }),
    ),
  );
  app();
  await screen.findByRole('button', { name: 'Retry operations' });
  expect(
    screen.queryByRole('link', { name: 'Operations guest — Deluxe #51' }),
  ).not.toBeInTheDocument();
});
