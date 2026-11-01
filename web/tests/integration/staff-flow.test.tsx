import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { property } from '../fixtures';
const base = 'http://localhost:5173/api/v1';
const admin = {
  ...property(),
  address: 'River road',
  postal_code: null,
  owner_name: 'Owner',
  owner_phone: null,
  is_published: false,
  image_paths: ['properties/1/photo.webp'],
};
const profile = {
  id: 1,
  name: 'Staff Agent',
  email: 'staff@example.test',
  role: { name: 'Administrator', permission_type: 'all', permissions: [] },
};
const pagination = { current_page: 1, last_page: 1, total: 1 };
const server = setupServer(
  http.get(`${base}/auth/me`, ({ request }) =>
    request.headers.get('Authorization') === 'Bearer staff-token'
      ? HttpResponse.json({ data: profile })
      : new HttpResponse(null, { status: 401 }),
  ),
  http.get(`${base}/admin/properties`, () =>
    HttpResponse.json({ data: [admin], meta: pagination }),
  ),
  http.get(`${base}/admin/properties/:id`, () => HttpResponse.json({ data: admin })),
  http.get(`${base}/admin/reports/overview`, () =>
    HttpResponse.json({
      data: { properties: { total: 3 }, enquiries: null },
      meta: { as_of: '2026-11-01', period: { timezone: 'UTC' } },
    }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
function signedIn(path = '/staff') {
  sessionStorage.setItem('sda.staff.token', 'staff-token');
  return app(path);
}
it('signs in through Laravel and revokes the token on logout', async () => {
  server.use(
    http.post(`${base}/auth/login`, async ({ request }) => {
      expect(await request.json()).toMatchObject({
        email: 'staff@example.test',
        password: 'password',
      });
      return HttpResponse.json({ data: { access_token: 'staff-token' } }, { status: 201 });
    }),
    http.post(`${base}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  );
  app();
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'staff@example.test');
  await user.type(screen.getByLabelText('Password'), 'password');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Staff Agent · Administrator')).toBeInTheDocument();
  expect(await screen.findByText('Not available for your account')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument();
  expect(sessionStorage.getItem('sda.staff.token')).toBeNull();
});
it('does not discard the session or claim successful revocation after logout fails', async () => {
  server.use(http.post(`${base}/auth/logout`, () => new HttpResponse(null, { status: 500 })));
  signedIn();
  await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  expect(sessionStorage.getItem('sda.staff.token')).toBe('staff-token');
});
it('removes an expired session and hides private content', async () => {
  sessionStorage.setItem('sda.staff.token', 'expired');
  app('/staff/properties');
  expect(await screen.findByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument();
  expect(sessionStorage.getItem('sda.staff.token')).toBeNull();
  expect(screen.queryByText(admin.title)).not.toBeInTheDocument();
});
it('denies create without its explicit permission and never calls the create endpoint', async () => {
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: { name: 'Reader', permission_type: 'custom', permissions: ['properties'] },
        },
      }),
    ),
  );
  signedIn('/staff/properties/new');
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
  expect(screen.queryByRole('button', { name: 'Save property' })).not.toBeInTheDocument();
});
it('edits private property fields and uploads with POST method override', async () => {
  let saved = false;
  server.use(
    http.post(`${base}/admin/properties/:id`, async ({ request }) => {
      const data = await request.formData();
      expect(data.get('_method')).toBe('PUT');
      expect(data.get('title')).toBe('Updated river house');
      expect(data.get('is_published')).toBe('1');
      expect(data.get('remove_images[]')).toBe(admin.image_paths[0]);
      expect(data.has('photos[]')).toBe(false);
      saved = true;
      return HttpResponse.json({ data: { ...admin, title: 'Updated river house' } });
    }),
  );
  signedIn('/staff/properties/1/edit');
  const user = userEvent.setup();
  const title = await screen.findByLabelText('Title *');
  await user.clear(title);
  await user.type(title, 'Updated river house');
  await user.click(screen.getByLabelText('Published on website'));
  await user.click(screen.getByLabelText('Remove photo 1'));
  await user.click(screen.getByRole('button', { name: 'Save property' }));
  await waitFor(() => expect(saved).toBe(true));
  expect(await screen.findByRole('heading', { name: 'Properties' })).toBeInTheDocument();
});
it('preserves unsaved values after server field errors', async () => {
  server.use(
    http.post(`${base}/admin/properties/:id`, () =>
      HttpResponse.json(
        { errors: { price: ['Price exceeds limit'], 'photos.0': ['Invalid photo'] } },
        { status: 422 },
      ),
    ),
  );
  signedIn('/staff/properties/1/edit');
  await screen.findByLabelText('Title *');
  fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Keep this title' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save property' }).closest('form')!);
  expect(await screen.findByText(/Price exceeds limit/)).toBeInTheDocument();
  expect(screen.getByLabelText('Title *')).toHaveValue('Keep this title');
  expect(screen.getByText(/Invalid photo/)).toBeInTheDocument();
});
it('creates unpublished properties with no client-assigned user', async () => {
  let saved = false;
  server.use(
    http.post(`${base}/admin/properties`, async ({ request }) => {
      const f = await request.formData();
      expect(f.get('is_published')).toBe('0');
      expect(f.get('accepts_enquiries')).toBe('0');
      expect(f.has('user_id')).toBe(false);
      expect(f.has('_method')).toBe(false);
      saved = true;
      return HttpResponse.json({ data: admin }, { status: 201 });
    }),
  );
  signedIn('/staff/properties/new');
  await screen.findByLabelText('Title *');
  for (const [name, value] of [
    ['Title *', 'New home'],
    ['Price (INR) *', '100.01'],
    ['Area *', '100'],
    ['Address *', 'Road'],
    ['City *', 'Dandeli'],
    ['State *', 'Karnataka'],
    ['Owner name *', 'Owner'],
  ])
    fireEvent.change(screen.getByLabelText(name), { target: { value } });
  fireEvent.submit(screen.getByRole('button', { name: 'Save property' }).closest('form')!);
  await waitFor(() => expect(saved).toBe(true));
});
it('renders enquiry contacts only in the protected staff list', async () => {
  server.use(
    http.get(`${base}/admin/enquiries`, () =>
      HttpResponse.json({
        data: [
          {
            id: 1,
            property_title: 'River house',
            name: 'Buyer',
            email: 'buyer@example.test',
            phone: null,
            message: 'Arrange a visit',
            lead_id: null,
            created_at: '2026-11-01',
          },
        ],
        meta: pagination,
      }),
    ),
  );
  signedIn('/staff/enquiries');
  expect(await screen.findByText(/buyer@example.test/)).toBeInTheDocument();
  expect(screen.getByText('Arrange a visit')).toBeInTheDocument();
});
it('renders scoped lead summaries and handles 403 without fabricated empty data', async () => {
  server.use(http.get(`${base}/admin/leads`, () => new HttpResponse(null, { status: 403 })));
  signedIn('/staff/leads');
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
  expect(screen.queryByText('No leads found.')).not.toBeInTheDocument();
});
it('preserves edits after returning from a photo picker and refreshes role permissions', async () => {
  signedIn('/staff/properties/1/edit');
  await screen.findByLabelText('Title *');
  fireEvent.change(screen.getByLabelText('Title *'), { target: { value: 'Unsaved draft' } });
  fireEvent.focus(window);
  await waitFor(() => expect(screen.getByLabelText('Title *')).toHaveValue('Unsaved draft'));
  server.use(
    http.get(`${base}/auth/me`, () =>
      HttpResponse.json({
        data: {
          ...profile,
          role: { name: 'Reader', permission_type: 'custom', permissions: ['properties'] },
        },
      }),
    ),
  );
  fireEvent.focus(window);
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
  expect(screen.queryByRole('button', { name: 'Save property' })).not.toBeInTheDocument();
});
