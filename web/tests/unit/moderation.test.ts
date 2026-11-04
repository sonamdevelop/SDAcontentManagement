import { expect, it } from 'vitest';
import { isModerationDetail, moderationFilters } from '../../src/staff/moderation';
import { moderationDetail } from '../moderation-fixtures';
it('rejects cross-property and future-revision review snapshots', () => {
  expect(isModerationDetail(moderationDetail)).toBe(true);
  expect(
    isModerationDetail({ ...moderationDetail, listing: { ...moderationDetail.listing, id: 8 } }),
  ).toBe(false);
  expect(
    isModerationDetail({
      ...moderationDetail,
      history: [{ ...moderationDetail.history[0], revision: 2 }],
    }),
  ).toBe(false);
  expect(
    isModerationDetail({
      ...moderationDetail,
      history: [
        { ...moderationDetail.history[0], snapshot: { ...moderationDetail.listing, id: 8 } },
      ],
    }),
  ).toBe(false);
});
it('retains valid queue filters and rejects invalid statuses and IDs', () => {
  expect(moderationFilters({ status: 'rejected', property_id: '7' }).toString()).toBe(
    'status=rejected&property_id=7',
  );
  expect(() => moderationFilters({ property_id: '1.5' })).toThrow();
  expect(() => moderationFilters({ status: 'sold' })).toThrow();
});
