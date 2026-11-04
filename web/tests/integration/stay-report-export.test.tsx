import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { stay, stayMeta } from '../stay-fixtures';
import {
  stayReport,
  stayReportStaff,
  reportPath,
  stayReportCsv,
  stayReportFilename,
  stayReportCsvHeaders,
} from '../stay-report-fixtures';
const base = 'http://localhost:5173/api/v1',
  downloaded: string[] = [];
const create = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  revoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const server = setupServer(
  http.get(base + '/auth/me', () => HttpResponse.json({ data: stayReportStaff })),
  http.get(base + '/admin/stays', () => HttpResponse.json({ data: [stay], meta: stayMeta })),
  http.get(base + '/admin/stays/1/report', () => HttpResponse.json(stayReport)),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  downloaded.length = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:stay-report'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  sessionStorage.clear();
  vi.restoreAllMocks();
  if (create) Object.defineProperty(URL, 'createObjectURL', create);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (revoke) Object.defineProperty(URL, 'revokeObjectURL', revoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});
afterAll(() => server.close());
function app() {
  sessionStorage.setItem('sda.staff.token', 'finance-token');
  sessionStorage.setItem('sda.customer.token', 'customer-secret');
  return render(
    <MemoryRouter
      initialEntries={[reportPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('downloads selected filters with staff credentials and a safe filename, then releases the blob on unmount', async () => {
  server.use(
    http.get(base + '/admin/stays/1/report/export', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer finance-token');
      expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({
        from: '2030-01-02',
        to: '2030-01-04',
      });
      return new HttpResponse(stayReportCsv, { headers: stayReportCsvHeaders });
    }),
  );
  const view = app();
  await userEvent.click(await screen.findByRole('button', { name: 'Export stay report CSV' }));
  await screen.findByRole('button', { name: 'Export stay report CSV' });
  expect(downloaded).toEqual([stayReportFilename]);
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:stay-report');
});
it('rejects HTML or mismatched filenames and allows a safe retry without losing the report', async () => {
  server.use(
    http.get(
      base + '/admin/stays/1/report/export',
      () =>
        new HttpResponse('<html>Login</html>', {
          headers: { ...stayReportCsvHeaders, 'Content-Type': 'text/html' },
        }),
    ),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Export stay report CSV' }));
  await screen.findByRole('alert');
  expect(downloaded).toEqual([]);
  server.use(
    http.get(
      base + '/admin/stays/1/report/export',
      () =>
        new HttpResponse(stayReportCsv, {
          headers: {
            ...stayReportCsvHeaders,
            'Content-Disposition':
              'attachment; filename="sda-stay-report-2-2030-01-02-2030-01-04.csv"',
          },
        }),
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Export stay report CSV' }));
  await screen.findByRole('alert');
  expect(downloaded).toEqual([]);
  server.use(
    http.get(
      base + '/admin/stays/1/report/export',
      () => new HttpResponse(stayReportCsv, { headers: stayReportCsvHeaders }),
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Export stay report CSV' }));
  await screen.findByRole('button', { name: 'Export stay report CSV' });
  expect(downloaded).toEqual([stayReportFilename]);
  expect(screen.getByText('INR 400.04')).toBeInTheDocument();
});
it('shows a server validation error without downloading a partial file', async () => {
  server.use(
    http.get(base + '/admin/stays/1/report/export', () =>
      HttpResponse.json({ errors: { export: ['Choose a smaller range.'] } }, { status: 422 }),
    ),
  );
  app();
  await userEvent.click(await screen.findByRole('button', { name: 'Export stay report CSV' }));
  await screen.findByText('export: Choose a smaller range.');
  expect(downloaded).toEqual([]);
});
