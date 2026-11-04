import { expect, it } from 'vitest';
import {
  isCancellation,
  validCancellationHistory,
  cancellationFilters,
} from '../../src/domain/cancellations';
import { cancellation, reviewedCancellation } from '../cancellation-fixtures';
it('validates terminal decision history without accepting cross-booking or incomplete rows', () => {
  expect(isCancellation(cancellation)).toBe(true);
  expect(isCancellation(reviewedCancellation)).toBe(true);
  expect(isCancellation({ ...reviewedCancellation, decided_at: null })).toBe(false);
  expect(validCancellationHistory([cancellation], 52)).toBe(false);
  expect(validCancellationHistory([cancellation, cancellation], 51)).toBe(false);
});
it('rejects invalid queue filters and retains valid status and booking identity', () => {
  expect(cancellationFilters({ booking_id: '51', status: 'rejected' }).toString()).toBe(
    'status=rejected&booking_id=51',
  );
  expect(() => cancellationFilters({ booking_id: '1.5' })).toThrow();
  expect(() => cancellationFilters({ status: 'confirmed' })).toThrow();
});
