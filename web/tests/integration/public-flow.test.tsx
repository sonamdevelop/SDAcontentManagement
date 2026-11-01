import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { page, property } from '../fixtures';
const base = 'http://localhost:5173/api/v1';
const server = setupServer(
  http.get(`${base}/properties`, () => HttpResponse.json(page())),
  http.get(`${base}/properties/:id`, () => HttpResponse.json({ data: property() })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
function app(path = '/properties') {
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
async function fillEnquiry() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Your name *'), 'Asha Rao');
  await user.type(screen.getByLabelText('Email address *'), 'ASHA@example.com');
  await user.type(screen.getByLabelText('Your message *'), 'Please arrange a visit.');
  await user.click(screen.getByRole('checkbox'));
  return user;
}
it('fetches catalogue filters, resets paging and renders real pagination responses', async () => {
  const urls: URL[] = [];
  server.use(
    http.get(`${base}/properties`, ({ request }) => {
      const url = new URL(request.url);
      urls.push(url);
      return HttpResponse.json(
        page(
          [
            property({
              title:
                url.searchParams.get('page') === '2' ? 'Second page house' : 'River view apartment',
            }),
          ],
          Number(url.searchParams.get('page') ?? 1),
          2,
          10,
        ),
      );
    }),
  );
  app();
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'River view apartment' });
  await user.type(screen.getByLabelText('City'), 'Dandeli');
  await user.selectOptions(screen.getByLabelText('Looking to'), 'rent');
  await user.click(screen.getByRole('button', { name: 'Find properties' }));
  await waitFor(() => expect(urls.at(-1)?.searchParams.get('purpose')).toBe('rent'));
  await screen.findByRole('heading', { name: 'River view apartment' });
  await user.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByRole('heading', { name: 'Second page house' });
  expect(urls.at(-1)?.searchParams.get('city')).toBe('Dandeli');
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});
it('validates visible price bounds without sending an invalid filter request', async () => {
  app();
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'River view apartment' });
  await user.type(screen.getByLabelText('Minimum price'), '100');
  await user.type(screen.getByLabelText('Maximum price'), '50');
  await user.click(screen.getByRole('button', { name: 'Find properties' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Maximum price');
  expect(screen.getByRole('heading', { name: 'River view apartment' })).toBeInTheDocument();
});
it('shows an empty state and recovers from a failed catalogue request', async () => {
  server.use(
    http.get(`${base}/properties`, () => new HttpResponse(null, { status: 503 }), { once: true }),
  );
  app();
  const user = userEvent.setup();
  await screen.findByText('We couldn’t load the properties.');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'River view apartment' });
  server.use(http.get(`${base}/properties`, () => HttpResponse.json(page([]))));
  await user.click(screen.getByRole('button', { name: 'Find properties' }));
  await user.type(screen.getByLabelText('City'), 'No matches');
  await user.click(screen.getByRole('button', { name: 'Find properties' }));
  await screen.findByText('No properties match just yet.');
});
it('renders a detail gallery, escaped description and only public location data', async () => {
  server.use(
    http.get(`${base}/properties/:id`, () =>
      HttpResponse.json({
        data: {
          ...property({
            description: '<img src=x onerror=alert(1)>',
            photos: ['/storage/front.jpg', '/storage/back.jpg', 'javascript:alert(1)'],
          }),
          address: 'Private exact address',
          owner_phone: 'PRIVATE',
        },
      }),
    ),
  );
  app('/properties/7');
  const user = userEvent.setup();
  await screen.findByRole('heading', { name: 'River view apartment' });
  expect(screen.queryByText('Private exact address')).not.toBeInTheDocument();
  expect(screen.getByText('<img src=x onerror=alert(1)>').tagName).toBe('P');
  await user.click(screen.getByRole('button', { name: 'Next photo' }));
  expect(screen.getByRole('img', { name: 'River view apartment — photo 2' })).toHaveAttribute(
    'src',
    'http://localhost:5173/storage/back.jpg',
  );
  fireEvent.error(screen.getByRole('img', { name: 'River view apartment — photo 2' }));
  expect(screen.getByText('Photos coming soon')).toBeInTheDocument();
});
it('handles unavailable properties and a detail page with enquiries disabled', async () => {
  server.use(http.get(`${base}/properties/:id`, () => new HttpResponse('{}', { status: 404 })));
  const view = app('/properties/99');
  await screen.findByText('This property is no longer available.');
  view.unmount();
  server.use(
    http.get(`${base}/properties/:id`, () =>
      HttpResponse.json({ data: property({ accepts_enquiries: false }) }),
    ),
  );
  app('/properties/7');
  await screen.findByText('Enquiries are currently closed.');
  expect(screen.queryByRole('button', { name: 'Send enquiry' })).not.toBeInTheDocument();
});
it('validates all enquiry fields before issuing a request', async () => {
  app('/properties/7');
  await screen.findByRole('heading', { name: 'River view apartment' });
  await userEvent.click(screen.getByRole('button', { name: 'Send enquiry' }));
  expect(screen.getByLabelText('Your name *')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('Please agree to be contacted about this property.')).toBeInTheDocument();
});
it('retains an uncertain enquiry and retries with the same UUID and normalized payload', async () => {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post(`${base}/properties/7/enquiries`, async ({ request }) => {
      bodies.push((await request.json()) as Record<string, unknown>);
      return bodies.length === 1
        ? HttpResponse.error()
        : HttpResponse.json({ message: 'Received' }, { status: 202 });
    }),
  );
  app('/properties/7');
  await screen.findByRole('heading', { name: 'River view apartment' });
  const user = await fillEnquiry();
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Your name *')).toHaveValue('Asha Rao');
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByText('Enquiry sent.');
  expect(bodies).toHaveLength(2);
  expect(bodies[0].submission_id).toBe(bodies[1].submission_id);
  expect(bodies[0].email).toBe('asha@example.com');
  expect(bodies[0].consent).toBe(true);
});
it('maps backend field errors and generates a new identity when the user corrects the payload', async () => {
  const keys: unknown[] = [];
  server.use(
    http.post(`${base}/properties/7/enquiries`, async ({ request }) => {
      const data = (await request.json()) as Record<string, unknown>;
      keys.push(data.submission_id);
      return keys.length === 1
        ? HttpResponse.json(
            { errors: { email: ['Please use another email address.'] } },
            { status: 422 },
          )
        : HttpResponse.json({ message: 'Received' }, { status: 202 });
    }),
  );
  app('/properties/7');
  await screen.findByRole('heading', { name: 'River view apartment' });
  const user = await fillEnquiry();
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByText('Please use another email address.');
  await user.clear(screen.getByLabelText('Email address *'));
  await user.type(screen.getByLabelText('Email address *'), 'new@example.com');
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByText('Enquiry sent.');
  expect(keys[0]).not.toBe(keys[1]);
});
it('disables resubmission if the property becomes unavailable or the service rate-limits it', async () => {
  server.use(
    http.post(`${base}/properties/7/enquiries`, () =>
      HttpResponse.json({}, { status: 429, headers: { 'Retry-After': '30' } }),
    ),
  );
  const view = app('/properties/7');
  await screen.findByRole('heading', { name: 'River view apartment' });
  let user = await fillEnquiry();
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByRole('button', { name: /Try again in/ });
  expect(screen.getByRole('button', { name: /Try again in/ })).toBeDisabled();
  view.unmount();
  server.use(
    http.post(`${base}/properties/7/enquiries`, () => HttpResponse.json({}, { status: 404 })),
  );
  app('/properties/7');
  await screen.findByRole('heading', { name: 'River view apartment' });
  user = await fillEnquiry();
  await user.click(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByText(/no longer accepting enquiries/);
  expect(screen.getByRole('button', { name: 'Send enquiry' })).toBeDisabled();
});
it('blocks double submission while an acknowledgement is pending', async () => {
  let calls = 0;
  server.use(
    http.post(`${base}/properties/7/enquiries`, async () => {
      calls++;
      await delay(80);
      return HttpResponse.json({}, { status: 202 });
    }),
  );
  app('/properties/7');
  await screen.findByRole('heading', { name: 'River view apartment' });
  const user = await fillEnquiry();
  await user.dblClick(screen.getByRole('button', { name: 'Send enquiry' }));
  await screen.findByText('Enquiry sent.');
  expect(calls).toBe(1);
});
