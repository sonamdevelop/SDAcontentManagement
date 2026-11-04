import { StaffApi, StaffError } from '../staff/api';
import { VisitApi } from '../staff/visits';
export type CancellationRequest = {
  id: number;
  booking_id: number;
  status: 'pending' | 'approved' | 'rejected' | 'closed';
  reason: string;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
};
export type CancellationQueueRow = CancellationRequest & {
  stay_name: string;
  room_name: string;
  check_in: string;
  check_out: string;
  timezone: string;
};
export function isCancellation(v: unknown): v is CancellationRequest {
  if (!v || typeof v !== 'object') return false;
  const r = v as CancellationRequest;
  return (
    Number.isSafeInteger(r.id) &&
    r.id > 0 &&
    Number.isSafeInteger(r.booking_id) &&
    r.booking_id > 0 &&
    ['pending', 'approved', 'rejected', 'closed'].includes(r.status) &&
    typeof r.reason === 'string' &&
    r.reason.length > 0 &&
    typeof r.created_at === 'string' &&
    Number.isFinite(Date.parse(r.created_at)) &&
    (r.decision_reason === null || typeof r.decision_reason === 'string') &&
    (r.decided_at === null ||
      (typeof r.decided_at === 'string' && Number.isFinite(Date.parse(r.decided_at)))) &&
    (r.status === 'pending'
      ? r.decided_at === null && r.decision_reason === null
      : r.decided_at !== null &&
        typeof r.decision_reason === 'string' &&
        r.decision_reason.length > 0)
  );
}
export function validCancellationHistory(v: unknown, booking: number) {
  return (
    v === undefined ||
    (Array.isArray(v) &&
      v.every((r) => isCancellation(r) && r.booking_id === booking) &&
      new Set(v.map((r) => r.id)).size === v.length)
  );
}
export function cancellationFilters(values: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  const status = values.status || 'pending';
  if (!['pending', 'approved', 'rejected', 'closed'].includes(status))
    throw new Error('Choose a cancellation request status.');
  p.set('status', status);
  if (values.booking_id) {
    if (!/^[1-9]\d*$/.test(values.booking_id) || !Number.isSafeInteger(Number(values.booking_id)))
      throw new Error('Use a positive booking ID.');
    p.set('booking_id', values.booking_id);
  }
  return p;
}
export class CancellationApi {
  constructor(private api: StaffApi) {}
  list(params: URLSearchParams, signal?: AbortSignal) {
    return new VisitApi(this.api).page(
      '/admin/stay-cancellation-requests?' + params,
      (v): v is CancellationQueueRow =>
        isCancellation(v) &&
        ['stay_name', 'room_name', 'check_in', 'check_out', 'timezone'].every(
          (k) => typeof (v as unknown as Record<string, unknown>)[k] === 'string',
        ),
      signal,
    );
  }
  async decide(id: number, data: { decision: 'approve' | 'reject'; decision_reason: string }) {
    const body = await this.api.request<{ data: unknown }>(
      `/admin/stay-cancellation-requests/${id}/decision`,
      { method: 'PATCH', body: JSON.stringify(data) },
    );
    if (
      !isCancellation(body?.data) ||
      body.data.id !== id ||
      body.data.status !== (data.decision === 'approve' ? 'approved' : 'rejected') ||
      body.data.decision_reason !== data.decision_reason
    )
      throw new StaffError(502);
    return body.data;
  }
}
