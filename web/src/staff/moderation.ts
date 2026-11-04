import { isProperty, type Property } from '../domain/property';
import { StaffApi, StaffError } from './api';
import { VisitApi } from './visits';
export type ModerationStatus = 'pending' | 'approved' | 'rejected';
export type ReviewedListing = Omit<Property, 'status'> & { status: string };
export type ModerationEvent = {
  id: number;
  revision: number;
  action: 'created' | 'content_changed' | 'submitted' | 'approved' | 'rejected' | 'legacy_approved';
  actor_id: number | null;
  reason: string;
  snapshot: ReviewedListing | null;
  created_at: string;
};
export type ModerationDetail = {
  id: number;
  moderation_status: ModerationStatus;
  moderation_revision: number;
  moderation_reason: string | null;
  moderated_at: string | null;
  is_published: boolean;
  accepts_enquiries: boolean;
  listing: ReviewedListing;
  history: ModerationEvent[];
};
export type ModerationRow = Pick<
  ModerationDetail,
  'id' | 'moderation_status' | 'moderation_revision' | 'moderation_reason' | 'is_published'
> & { title: string; city: string; price: string; currency: string; status: string };
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const timestamp = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
function listing(v: unknown): v is ReviewedListing {
  return (
    !!v &&
    typeof v === 'object' &&
    isProperty({ ...v, status: 'available' }) &&
    ['available', 'reserved', 'sold', 'rented', 'unavailable'].includes(
      (v as ReviewedListing).status,
    )
  );
}
function metadata(r: ModerationRow | ModerationDetail) {
  return (
    id(r.id) &&
    id(r.moderation_revision) &&
    ['pending', 'approved', 'rejected'].includes(r.moderation_status) &&
    (r.moderation_reason === null || typeof r.moderation_reason === 'string') &&
    typeof r.is_published === 'boolean'
  );
}
export function isModerationDetail(v: unknown): v is ModerationDetail {
  if (!v || typeof v !== 'object') return false;
  const r = v as ModerationDetail;
  return (
    metadata(r) &&
    (r.moderated_at === null || timestamp(r.moderated_at)) &&
    typeof r.accepts_enquiries === 'boolean' &&
    listing(r.listing) &&
    r.listing.id === r.id &&
    Array.isArray(r.history) &&
    r.history.every(
      (e) =>
        id(e.id) &&
        id(e.revision) &&
        e.revision <= r.moderation_revision &&
        [
          'created',
          'content_changed',
          'submitted',
          'approved',
          'rejected',
          'legacy_approved',
        ].includes(e.action) &&
        (e.actor_id === null || id(e.actor_id)) &&
        typeof e.reason === 'string' &&
        timestamp(e.created_at) &&
        (e.snapshot === null || (listing(e.snapshot) && e.snapshot.id === r.id)),
    ) &&
    new Set(r.history.map((e) => e.id)).size === r.history.length
  );
}
export function moderationFilters(values: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  const status = values.status || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status))
    throw new Error('Choose a review status.');
  p.set('status', status);
  if (values.property_id) {
    if (!/^[1-9]\d*$/.test(values.property_id) || !id(Number(values.property_id)))
      throw new Error('Use a positive property ID.');
    p.set('property_id', values.property_id);
  }
  return p;
}
export class ModerationApi {
  constructor(private api: StaffApi) {}
  list(params: URLSearchParams, signal?: AbortSignal) {
    return new VisitApi(this.api).page(
      '/admin/property-moderation?' + params,
      (v): v is ModerationRow =>
        !!v &&
        typeof v === 'object' &&
        metadata(v as ModerationRow) &&
        ['title', 'city', 'price', 'currency', 'status'].every(
          (k) => typeof (v as unknown as Record<string, unknown>)[k] === 'string',
        ),
      signal,
    );
  }
  private valid(body: { data: unknown }, id: number) {
    if (!isModerationDetail(body?.data) || body.data.id !== id) throw new StaffError(502);
    return body.data;
  }
  async get(id: number, signal?: AbortSignal) {
    return this.valid(
      await this.api.request<{ data: unknown }>(`/admin/properties/${id}/moderation`, { signal }),
      id,
    );
  }
  async decide(
    id: number,
    data: { expected_revision: number; decision: 'approved' | 'rejected'; reason: string },
  ) {
    const result = this.valid(
      await this.api.request<{ data: unknown }>(`/admin/properties/${id}/moderation`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
      id,
    );
    if (
      result.moderation_revision !== data.expected_revision ||
      result.moderation_status !== data.decision ||
      result.moderation_reason !== data.reason
    )
      throw new StaffError(502);
    return result;
  }
  async submit(id: number, data: { expected_revision: number; reason: string }) {
    const result = this.valid(
      await this.api.request<{ data: unknown }>(`/admin/properties/${id}/moderation/submit`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
      id,
    );
    if (result.moderation_revision !== data.expected_revision + 1) throw new StaffError(502);
    return result;
  }
}
