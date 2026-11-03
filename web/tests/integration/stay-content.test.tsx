import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { publicStay, editableStay } from '../stay-content-fixtures';
const base = 'http://localhost:5173/api/v1';
const server = setupServer(
  http.get(`${base}/stays`, () =>
    HttpResponse.json({ data: [publicStay], meta: { current_page: 1, last_page: 1, total: 1 } }),
  ),
  http.get(`${base}/stays/1`, () => HttpResponse.json({ data: publicStay })),
  http.get(`${base}/auth/me`, () =>
    HttpResponse.json({
      data: {
        id: 1,
        name: 'Staff',
        email: 'staff@example.test',
        role: {
          name: 'Manager',
          permission_type: 'custom',
          permissions: ['stays', 'stays.manage'],
        },
      },
    }),
  ),
  http.get(`${base}/admin/stays/1/content`, () => HttpResponse.json({ data: editableStay })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path: string) {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('filters and paginates public stays without attaching a saved staff token, then shows safe room details', async () => {
  sessionStorage.setItem('sda.staff.token', 'must-not-leak');
  const urls: string[] = [];
  server.use(
    http.get(`${base}/stays`, ({ request }) => {
      expect(request.headers.get('authorization')).toBeNull();
      expect(request.credentials).toBe('omit');
      urls.push(request.url);
      const p = new URL(request.url).searchParams;
      return HttpResponse.json({
        data: [publicStay],
        meta: { current_page: Number(p.get('page') || 1), last_page: 2, total: 2 },
      });
    }),
  );
  app('/stays');
  await screen.findByRole('link', { name: 'River stay' });
  await userEvent.type(screen.getByRole('textbox', { name: 'Stay city' }), 'Dandeli');
  await userEvent.click(screen.getByRole('button', { name: 'Filter stays' }));
  await waitFor(() => expect(urls.at(-1)).toContain('city=Dandeli'));
  await userEvent.click(screen.getByRole('button', { name: 'Next stays' }));
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  await userEvent.click(screen.getByRole('link', { name: 'River stay' }));
  await screen.findByRole('heading', { name: 'Room types' });
  expect(screen.getByText('Forest view')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Book now' })).not.toBeInTheDocument();
});
it('handles unpublished stay responses and refuses inconsistent prices', async () => {
  server.use(
    http.get(`${base}/stays/1`, () => HttpResponse.json({ message: 'Not found' }, { status: 404 })),
  );
  app('/stays/1');
  await screen.findByText('This stay is not available.');
  expect(screen.queryByRole('heading', { name: 'Room types' })).not.toBeInTheDocument();
});
it('saves only the selected room content using multipart data and reloads the authoritative state', async () => {
  sessionStorage.setItem('sda.staff.token', 'content-token');
  let saves = 0;
  server.use(
    http.post(`${base}/admin/stays/1/rooms/2/content`, async ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer content-token');
      const body = await request.formData();
      expect(body.get('description')).toBe('Updated room details');
      expect(body.get('is_published')).toBe('1');
      saves++;
      return HttpResponse.json({ data: editableStay.rooms[0] });
    }),
  );
  app('/staff/stays/1/content?room_id=2');
  await screen.findByRole('textbox', { name: 'Public description' });
  await userEvent.clear(screen.getByRole('textbox', { name: 'Public description' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Public description' }),
    'Updated room details',
  );
  await userEvent.click(screen.getByRole('checkbox', { name: 'Published in stay catalogue' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save public content' }));
  await waitFor(() => expect(saves).toBe(1));
});
it('does not fetch content for staff without management permission', async () => {
  sessionStorage.setItem('sda.staff.token', 'reader');
  let calls = 0;
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          id: 1,
          name: 'Reader',
          email: 'reader@example.test',
          role: { name: 'Reader', permission_type: 'custom', permissions: ['stays'] },
        },
      }),
    ),
    http.get(`${base}/admin/stays/1/content`, () => {
      calls++;
      return HttpResponse.json({ data: editableStay });
    }),
  );
  app('/staff/stays/1/content');
  await screen.findByText('Stay content needs stay management permission.');
  expect(calls).toBe(0);
});
