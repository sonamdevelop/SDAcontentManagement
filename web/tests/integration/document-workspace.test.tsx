import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { document } from '../document-fixtures';
import { property } from '../fixtures';
const base = 'http://localhost:5173/api/v1';
const profile = {
  id: 1,
  name: 'Asha',
  email: 'asha@example.test',
  role: { name: 'Staff', permission_type: 'all', permissions: [] as string[] },
};
const admin = {
  ...property(),
  address: 'Private road',
  owner_name: 'Owner',
  is_published: false,
  image_paths: [],
};
const meta = { current_page: 1, last_page: 1, total: 1 };
const server = setupServer(
  http.get(`${base}/auth/me`, () => HttpResponse.json({ data: profile })),
  http.get(`${base}/admin/properties`, () => HttpResponse.json({ data: [admin], meta })),
  http.get(`${base}/admin/properties/:id`, () => HttpResponse.json({ data: admin })),
  http.get(`${base}/admin/properties/:id/documents`, () =>
    HttpResponse.json({ data: [document], meta }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  sessionStorage.clear();
});
afterAll(() => server.close());
function app(path = '/staff/properties/7/documents') {
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
        data: {
          ...profile,
          role: { name: 'Custom', permission_type: 'custom', permissions: values },
        },
      }),
    ),
  );
}
it('opens private metadata through the staff property list', async () => {
  app('/staff/properties');
  await userEvent.click(await screen.findByRole('link', { name: 'Private documents' }));
  expect(await screen.findByRole('heading', { name: document.title })).toBeInTheDocument();
  expect(screen.getByText('Private agreement copy')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download document' })).toBeInTheDocument();
});
it('filters and paginates document categories using server responses', async () => {
  const urls: string[] = [];
  server.use(
    http.get(`${base}/admin/properties/:id/documents`, ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json({
        data: [document],
        meta: {
          current_page: new URL(request.url).searchParams.get('page') === '2' ? 2 : 1,
          last_page: 2,
          total: 2,
        },
      });
    }),
  );
  app();
  await userEvent.selectOptions(
    await screen.findByRole('combobox', { name: 'Document category' }),
    'agreement',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Filter documents' }));
  await waitFor(() => expect(urls.at(-1)).toContain('category=agreement'));
  await userEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() => expect(urls.at(-1)).toContain('page=2'));
  expect(urls.at(-1)).toContain('category=agreement');
});
it('renders a document reader without upload/delete actions', async () => {
  permissions(['properties', 'properties.documents']);
  app();
  expect(await screen.findByRole('heading', { name: document.title })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Upload document' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete document' })).not.toBeInTheDocument();
});
it('allows upload-only permissions without requesting document metadata', async () => {
  permissions(['properties', 'properties.documents.create']);
  app();
  expect(await screen.findByRole('button', { name: 'Upload document' })).toBeInTheDocument();
  expect(screen.getByText(/does not have permission to list/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Download document' })).not.toBeInTheDocument();
});
it('denies document access without its exact permission', async () => {
  permissions(['properties', 'properties.edit']);
  app();
  expect(await screen.findByRole('alert')).toHaveTextContent('do not have permission');
  expect(screen.queryByLabelText('Document file')).not.toBeInTheDocument();
});
it('preserves private upload fields and file selection on validation failure', async () => {
  server.use(
    http.post(`${base}/admin/properties/:id/documents`, () =>
      HttpResponse.json({ errors: { file: ['Invalid PDF contents'] } }, { status: 422 }),
    ),
  );
  app();
  await userEvent.type(await screen.findByLabelText('Document title'), 'Keep title');
  const file = new File(['not a real pdf'], 'agreement.pdf', { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText('Document file'), file);
  fireEvent.submit(screen.getByRole('button', { name: 'Upload document' }).closest('form')!);
  expect(await screen.findByText(/Invalid PDF contents/)).toBeInTheDocument();
  expect(screen.getByLabelText('Document title')).toHaveValue('Keep title');
  expect((screen.getByLabelText('Document file') as HTMLInputElement).files?.[0]).toBe(file);
});
it('requires a concrete deletion confirmation and lets the user cancel it', async () => {
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Delete document' }));
  expect(screen.getByText(/stored file will be removed permanently/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Keep document' }));
  expect(screen.queryByRole('button', { name: 'Confirm deletion' })).not.toBeInTheDocument();
});
it('deletes once, reloads the list and reports successful removal', async () => {
  let deleted = false,
    calls = 0;
  server.use(
    http.delete(`${base}/admin/properties/7/documents/41`, async () => {
      calls++;
      await delay(30);
      deleted = true;
      return new HttpResponse(null, { status: 204 });
    }),
    http.get(`${base}/admin/properties/:id/documents`, () =>
      HttpResponse.json({
        data: deleted ? [] : [document],
        meta: { ...meta, total: deleted ? 0 : 1 },
      }),
    ),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Delete document' }));
  const user = userEvent.setup();
  await user.dblClick(screen.getByRole('button', { name: 'Confirm deletion' }));
  expect(await screen.findByText('Document deleted.')).toBeInTheDocument();
  expect(await screen.findByText('No matching documents.')).toBeInTheDocument();
  expect(calls).toBe(1);
});
it('retains metadata and shows an error when deletion fails', async () => {
  server.use(
    http.delete(
      `${base}/admin/properties/7/documents/41`,
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Delete document' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: document.title })).toBeInTheDocument();
  expect(screen.queryByText('Document deleted.')).not.toBeInTheDocument();
});
it('clears an expired session when a private download is rejected', async () => {
  server.use(
    http.get(
      `${base}/admin/properties/7/documents/41/download`,
      () => new HttpResponse(null, { status: 401 }),
    ),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Download document' }));
  expect(await screen.findByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument();
  expect(sessionStorage.getItem('sda.staff.token')).toBeNull();
  expect(screen.queryByRole('heading', { name: document.title })).not.toBeInTheDocument();
});
it('shows a missing property error without requesting its document list', async () => {
  server.use(
    http.get(`${base}/admin/properties/:id`, () => new HttpResponse(null, { status: 404 })),
  );
  app();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: document.title })).not.toBeInTheDocument();
});
