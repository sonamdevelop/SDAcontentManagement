import { afterEach, expect, it, vi } from 'vitest';
import { StaffApi } from '../../src/staff/api';
import {
  formatLeadValue,
  dueTimestamp,
  isFollowUp,
  isLead,
  LeadApi,
  localDateInput,
} from '../../src/staff/leads';
import { lead, task } from '../lead-fixtures';
afterEach(() => vi.restoreAllMocks());
it('validates detail contacts and follow-up data before rendering', () => {
  expect(isLead(lead)).toBe(true);
  expect(isLead({ ...lead, contact: { name: 'Buyer', emails: [{}], contact_numbers: [] } })).toBe(
    false,
  );
  expect(isLead({ ...lead, stage: { id: 1, name: 'New' } })).toBe(false);
  expect(isFollowUp(task)).toBe(true);
  expect(isFollowUp({ ...task, lead_ids: ['12'] })).toBe(false);
  expect(isFollowUp({ ...task, is_done: 'false' })).toBe(false);
});
it('round trips a local due time as a backend-compatible instant with seconds', () => {
  const input = '2026-12-14T10:30:45';
  const iso = dueTimestamp(input);
  expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  expect(localDateInput(iso)).toBe(input);
  expect(localDateInput(dueTimestamp('2026-12-14T10:30'))).toBe('2026-12-14T10:30:00');
});
it.each(['', 'invalid', '2026-02-30T10:00', '2026-12-14T25:30'])(
  'rejects invalid local due times: %s',
  (input) => {
    expect(() => dueTimestamp(input)).toThrow();
  },
);
it('keeps assignment and stage updates narrow and uses PATCH', async () => {
  const api = new StaffApi('staff');
  const request = vi.spyOn(api, 'request').mockResolvedValue({ data: lead });
  await new LeadApi(api).update(12, 'assignment', { user_id: 2 });
  expect(request).toHaveBeenCalledWith('/admin/leads/12/assignment', {
    method: 'PATCH',
    body: '{"user_id":2}',
  });
  await new LeadApi(api).update(12, 'stage', { lead_pipeline_stage_id: 3, lost_reason: 'Budget' });
  expect(request).toHaveBeenLastCalledWith('/admin/leads/12/stage', {
    method: 'PATCH',
    body: '{"lead_pipeline_stage_id":3,"lost_reason":"Budget"}',
  });
});
it('rejects malformed paginated data and invalid identifiers', async () => {
  const api = new StaffApi();
  vi.spyOn(api, 'request').mockResolvedValue({
    data: [task],
    meta: { current_page: 0, last_page: 1, total: 1 },
  });
  await expect(new LeadApi(api).followUps(new URLSearchParams())).rejects.toMatchObject({
    status: 502,
  });
  await expect(new LeadApi(api).detail('../1')).rejects.toMatchObject({ status: 404 });
});

it('formats four-decimal CRM values exactly without float rounding', () => {
  expect(formatLeadValue('6500000.5100', 'INR')).toBe('₹65,00,000.51');
  expect(formatLeadValue('6500000.5123', 'INR')).toBe('₹65,00,000.5123');
  expect(formatLeadValue('0.0001', 'INR')).toBe('₹0.0001');
  expect(formatLeadValue('', 'INR')).toBe('Value unavailable');
});
