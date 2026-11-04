import type { CancellationQueueRow } from '../src/domain/cancellations';
export const cancellation: CancellationQueueRow = {
  id: 8,
  booking_id: 51,
  status: 'pending',
  reason: 'Travel plans changed',
  decision_reason: null,
  created_at: '2026-11-04T08:00:00Z',
  decided_at: null,
  stay_name: 'River stay',
  room_name: 'Deluxe',
  check_in: '2030-01-01',
  check_out: '2030-01-03',
  timezone: 'Asia/Kolkata',
};
export const cancellationMeta = { current_page: 1, last_page: 1, total: 1 };
export const reviewedCancellation = {
  ...cancellation,
  status: 'approved' as const,
  decision_reason: 'Approved per guest request',
  decided_at: '2026-11-04T09:00:00Z',
};
export const cancellationStaff = {
  id: 1,
  name: 'Staff',
  email: 'staff@example.test',
  role: { name: 'Booking staff', permission_type: 'all', permissions: [] },
};
