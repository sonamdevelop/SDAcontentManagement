import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { App } from '../../src/App';
import { agentReport, reportStaff, reportCsv, csvHeaders } from '../agent-report-fixtures';
const base = 'http://localhost:5173/api/v1',
  downloaded: string[] = [];
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
  originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const server = setupServer(
  http.get(base + '/auth/me', () => HttpResponse.json({ data: reportStaff })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  downloaded.length = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:agent-report'),
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
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
});
afterAll(() => server.close());
function app(path = '/staff/agent-reports') {
  sessionStorage.setItem('sda.staff.token', 'report-staff');
  sessionStorage.setItem('sda.customer.token', 'customer-private');
  return render(
    <MemoryRouter
      initialEntries={[path]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <App />
    </MemoryRouter>,
  );
}
it('displays permitted outcomes and retains date/timezone filters across pagination', async () => {
  server.use(
    http.get(base + '/admin/reports/agents', ({ request }) => {
      expect(request.headers.get('authorization')).toBe('Bearer report-staff');
      const p = new URL(request.url).searchParams;
      expect(p.get('timezone')).toBe('UTC');
      return HttpResponse.json({
        ...agentReport,
        meta: {
          ...agentReport.meta,
          current_page: Number(p.get('page') || 1),
          period: { from: '2026-06-10', to: '2026-06-11', timezone: 'UTC' },
        },
      });
    }),
  );
  app('/staff/agent-reports?from=2026-06-10&to=2026-06-11&timezone=UTC');
  await screen.findByRole('heading', { name: 'Asha Agent · Agent #7' });
  expect(screen.getByRole('img', { name: /Lead outcomes/ })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Page 2 of 2 · 2 records');
  expect(screen.getByLabelText('Report from')).toHaveValue('2026-06-10');
  expect(screen.getByLabelText('Report timezone')).toHaveValue('UTC');
});
it('exports all filtered agents with displayed timezone and excludes pagination and customer credentials', async () => {
  server.use(
    http.get(base + '/admin/reports/agents', () =>
      HttpResponse.json({ ...agentReport, meta: { ...agentReport.meta, current_page: 2 } }),
    ),
    http.get(base + '/admin/reports/agents/export', ({ request }) => {
      const p = new URL(request.url).searchParams;
      expect(request.headers.get('authorization')).toBe('Bearer report-staff');
      expect(request.credentials).toBe('omit');
      expect(p.get('timezone')).toBe('UTC');
      expect(p.has('page')).toBe(false);
      expect(p.has('per_page')).toBe(false);
      return new HttpResponse(reportCsv, { headers: csvHeaders });
    }),
  );
  app('/staff/agent-reports?page=2&per_page=1');
  await screen.findByRole('button', { name: 'Export filtered agents CSV' });
  await userEvent.click(screen.getByRole('button', { name: 'Export filtered agents CSV' }));
  await vi.waitFor(() => expect(downloaded).toEqual(['sda-agent-report-2026-11-04.csv']));
});
it('shows inaccessible source sections as unavailable and rejects a non-CSV attachment', async () => {
  server.use(
    http.get(base + '/admin/reports/agents', () =>
      HttpResponse.json({
        ...agentReport,
        data: [{ ...agentReport.data[0], site_visits: null }],
        meta: { ...agentReport.meta, available_sections: ['leads'] },
      }),
    ),
    http.get(base + '/admin/reports/agents/export', () =>
      HttpResponse.json(
        { data: [] },
        { headers: { 'Content-Disposition': csvHeaders['Content-Disposition'] } },
      ),
    ),
  );
  app();
  await screen.findByText('Visit metrics are unavailable for this account.');
  await userEvent.click(screen.getByRole('button', { name: 'Export filtered agents CSV' }));
  await screen.findByText('Request failed. Please try again.');
  expect(downloaded).toEqual([]);
});
it('rejects internally inconsistent report totals instead of drawing misleading bars', async () => {
  server.use(
    http.get(base + '/admin/reports/agents', () =>
      HttpResponse.json({
        ...agentReport,
        data: [{ ...agentReport.data[0], leads: { ...agentReport.data[0].leads, total: 99 } }],
      }),
    ),
  );
  app();
  await screen.findByRole('alert');
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Export filtered agents CSV' }),
  ).not.toBeInTheDocument();
});
it('blocks the workspace without both report permissions before fetching report data', async () => {
  server.use(
    http.get(base + '/auth/me', () =>
      HttpResponse.json({
        data: { ...reportStaff, role: { ...reportStaff.role, permissions: ['property-reports'] } },
      }),
    ),
  );
  app();
  await screen.findByText('You do not have permission to view agent performance.');
  expect(
    screen.queryByRole('button', { name: 'Export filtered agents CSV' }),
  ).not.toBeInTheDocument();
});
