import type { ModerationDetail, ModerationRow } from '../src/staff/moderation';
import { property } from './fixtures';
export const moderationDetail: ModerationDetail = {
  id: 7,
  moderation_status: 'pending',
  moderation_revision: 1,
  moderation_reason: null,
  moderated_at: null,
  is_published: true,
  accepts_enquiries: true,
  listing: property(),
  history: [
    {
      id: 1,
      revision: 1,
      action: 'created',
      actor_id: 1,
      reason: 'Listing created and awaiting moderation.',
      snapshot: property(),
      created_at: '2026-11-04T08:00:00Z',
    },
  ],
};
export const approvedModeration: ModerationDetail = {
  ...moderationDetail,
  moderation_status: 'approved',
  moderation_reason: 'Reviewed listing',
  moderated_at: '2026-11-04T09:00:00Z',
  history: [
    ...moderationDetail.history,
    {
      id: 2,
      revision: 1,
      action: 'approved',
      actor_id: 1,
      reason: 'Reviewed listing',
      snapshot: property(),
      created_at: '2026-11-04T09:00:00Z',
    },
  ],
};
export const moderationRow: ModerationRow = {
  id: 7,
  title: 'River view apartment',
  city: 'Dandeli',
  price: '6500000.50',
  currency: 'INR',
  status: 'available',
  is_published: true,
  moderation_status: 'pending',
  moderation_revision: 1,
  moderation_reason: null,
};
export const moderationStaff = {
  id: 1,
  name: 'Reviewer',
  email: 'reviewer@example.test',
  role: { name: 'Reviewer', permission_type: 'all', permissions: [] },
};
export const moderationMeta = { current_page: 1, last_page: 1, total: 1 };
