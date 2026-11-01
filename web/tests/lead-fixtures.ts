import type { LeadDetail, FollowUp, Pipeline } from '../src/staff/leads';
export const lead: LeadDetail = {
  id: 12,
  title: 'River home enquiry',
  description: 'Arrange a viewing.',
  lead_value: '6500000.5100',
  currency: 'INR',
  user_id: 1,
  agent: { id: 1, name: 'Asha' },
  pipeline: { id: 1, name: 'Sales' },
  stage: { id: 1, name: 'New', code: 'new' },
  lost_reason: null,
  closed_at: null,
  expected_close_date: null,
  contact: {
    name: 'Buyer',
    emails: [{ value: 'buyer@example.test' }],
    contact_numbers: [{ value: '9000011111' }],
  },
};
export const pipelines: Pipeline[] = [
  {
    id: 1,
    name: 'Sales',
    stages: [
      { id: 1, name: 'New', code: 'new' },
      { id: 2, name: 'Won', code: 'won' },
      { id: 3, name: 'Lost', code: 'lost' },
    ],
  },
  { id: 2, name: 'Other pipeline', stages: [{ id: 4, name: 'Other stage', code: 'new' }] },
];
export const task: FollowUp = {
  id: 22,
  lead_ids: [12],
  type: 'task',
  title: 'Call buyer',
  comment: 'Discuss requirements',
  due_at: '2026-01-01T10:30:00Z',
  is_done: false,
  is_overdue: true,
  user_id: 1,
};
export const meta = { current_page: 1, last_page: 1, total: 1 };
