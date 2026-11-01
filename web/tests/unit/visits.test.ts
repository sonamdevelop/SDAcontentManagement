import { afterEach, expect, it, vi } from 'vitest';
import { StaffApi } from '../../src/staff/api';
import {
  isVisit,
  isVisitSummary,
  terminalAvailable,
  VisitApi,
  visitWindow,
} from '../../src/staff/visits';
import { visit } from '../visit-fixtures';
afterEach(() => vi.restoreAllMocks());
it('validates summary, private detail and audit events separately', () => {
  expect(isVisit(visit)).toBe(true);
  expect(isVisitSummary(visit)).toBe(true);
  expect(isVisit({ ...visit, events: undefined })).toBe(false);
  expect(isVisit({ ...visit, events: [{ ...visit.events[0], changes: 'invalid' }] })).toBe(false);
  expect(isVisitSummary({ ...visit, starts_at: 'invalid' })).toBe(false);
  expect(isVisitSummary({ ...visit, user_id: '1' })).toBe(false);
  expect(isVisit({ ...visit, property_id: null, lead_id: null, user_id: null })).toBe(true);
});
it('encodes explicit instants and validates future windows up to eight hours', () => {
  const now = new Date('2020-01-01T00:00:00Z').getTime();
  const result = visitWindow('2030-01-01T10:00', '2030-01-01T18:00', now);
  expect(result.starts_at).toMatch(/T\d{2}:\d{2}:\d{2}Z$/);
  expect(Date.parse(result.ends_at) - Date.parse(result.starts_at)).toBe(8 * 3600000);
});
it.each([
  ['2020-01-01T10:00', '2020-01-01T11:00'],
  ['2030-01-01T10:00', '2030-01-01T10:00'],
  ['2030-01-01T10:00', '2030-01-01T09:00'],
  ['2030-01-01T10:00', '2030-01-01T18:01'],
])('rejects invalid visit window %s to %s', (a, b) => {
  expect(() => visitWindow(a, b, new Date('2026-01-01').getTime())).toThrow();
});
it('limits outcomes to visits that have started', () => {
  expect(terminalAvailable(visit, Date.parse(visit.starts_at) - 1)).toBe(false);
  expect(terminalAvailable(visit, Date.parse(visit.starts_at))).toBe(true);
});
it('uses narrow PATCH bodies and validates responses', async () => {
  const api = new StaffApi();
  const request = vi.spyOn(api, 'request').mockResolvedValue({ data: visit });
  await new VisitApi(api).save({ user_id: 2 }, 31, 'assignment');
  expect(request).toHaveBeenCalledWith('/admin/site-visits/31/assignment', {
    method: 'PATCH',
    body: '{"user_id":2}',
  });
  request.mockResolvedValue({ data: {} });
  await expect(new VisitApi(api).detail('31')).rejects.toMatchObject({ status: 502 });
  await expect(new VisitApi(api).detail('../31')).rejects.toMatchObject({ status: 404 });
});
it('uses server-scoped available property choices with search and paging', async () => {
  const api = new StaffApi();
  const request = vi.spyOn(api, 'request').mockResolvedValue({
    data: [{ id: 7, title: 'River home', city: 'Dandeli' }],
    meta: { current_page: 2, last_page: 2, total: 2 },
  });
  const page = await new VisitApi(api).choices('properties', 2, 'River');
  expect(request.mock.calls[0][0]).toBe('/admin/properties?page=2&q=River&status=available');
  expect(page.data).toEqual([{ id: 7, name: 'River home · Dandeli' }]);
});
