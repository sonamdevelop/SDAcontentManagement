import { ApiError, publicApi } from './client';
import { safePhotoUrl } from '../domain/property';
export type StayContent = {
  id: number;
  name: string;
  description: string;
  rules: string;
  amenities: string[];
  photos: string[];
};
export type PublicRoom = StayContent & { capacity: number; nightly_rate: string };
export type PublicStay = StayContent & {
  city: string;
  timezone: string;
  currency: string;
  room_types_count: number;
  from_rate: string;
  rooms?: PublicRoom[];
};
export type StayPage = {
  data: PublicStay[];
  meta: { current_page: number; last_page: number; total: number };
};
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const amount = (v: unknown) =>
  typeof v === 'string' && /^\d{1,13}\.\d{2}$/.test(v) && BigInt(v.replace('.', '')) > 0n;
function content(v: unknown): v is StayContent {
  if (!v || typeof v !== 'object') return false;
  const r = v as StayContent;
  return (
    id(r.id) &&
    ['name', 'description', 'rules'].every(
      (k) => typeof (r as unknown as Record<string, unknown>)[k] === 'string',
    ) &&
    Array.isArray(r.amenities) &&
    r.amenities.length <= 30 &&
    r.amenities.every((a) => typeof a === 'string') &&
    Array.isArray(r.photos) &&
    r.photos.length <= 10 &&
    r.photos.every((p) => typeof p === 'string' && !!safePhotoUrl(p, publicApi.baseUrl))
  );
}
export function isPublicStay(v: unknown, detail = false): v is PublicStay {
  if (!content(v)) return false;
  const r = v as PublicStay;
  try {
    if (
      typeof r.city !== 'string' ||
      typeof r.timezone !== 'string' ||
      !new Intl.DateTimeFormat('en', { timeZone: r.timezone }) ||
      typeof r.currency !== 'string' ||
      !/^[A-Z]{3}$/.test(r.currency) ||
      !id(r.room_types_count) ||
      !amount(r.from_rate)
    )
      return false;
    if (detail) {
      if (
        !Array.isArray(r.rooms) ||
        r.rooms.length !== r.room_types_count ||
        !r.rooms.every((room) => content(room) && id(room.capacity) && amount(room.nightly_rate)) ||
        new Set(r.rooms.map((room) => room.id)).size !== r.rooms.length
      )
        return false;
      const lowest = r.rooms.reduce((a, b) =>
        BigInt(a.nightly_rate.replace('.', '')) < BigInt(b.nightly_rate.replace('.', '')) ? a : b,
      );
      if (lowest.nightly_rate !== r.from_rate) return false;
    }
    return true;
  } catch {
    return false;
  }
}
export class StayCatalogueApi {
  private async request(path: string, signal?: AbortSignal) {
    const response = await fetch(publicApi.baseUrl + path, {
      signal,
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new ApiError(response.status);
    try {
      return await response.json();
    } catch {
      throw new ApiError(502);
    }
  }
  async list(params: URLSearchParams, signal?: AbortSignal): Promise<StayPage> {
    const next = new URLSearchParams();
    if (params.get('city')) next.set('city', params.get('city')!);
    next.set('page', params.get('page') || '1');
    next.set('per_page', '12');
    if (
      !/^[1-9]\d*$/.test(next.get('page')!) ||
      !Number.isSafeInteger(Number(next.get('page'))) ||
      String(params.get('city') || '').length > 100
    )
      throw new ApiError(422);
    const body = await this.request(`/stays?${next}`, signal);
    if (
      !body ||
      !Array.isArray(body.data) ||
      !body.data.every((r: unknown) => isPublicStay(r)) ||
      !body.meta ||
      !id(body.meta.current_page) ||
      !id(body.meta.last_page) ||
      !Number.isSafeInteger(body.meta.total) ||
      body.meta.total < 0
    )
      throw new ApiError(502);
    return body;
  }
  async detail(stayId: string, signal?: AbortSignal): Promise<PublicStay> {
    if (!/^[1-9]\d*$/.test(stayId) || !Number.isSafeInteger(Number(stayId)))
      throw new ApiError(404);
    const body = await this.request(`/stays/${stayId}`, signal);
    if (!isPublicStay(body?.data, true) || body.data.id !== Number(stayId)) throw new ApiError(502);
    return body.data;
  }
}
export const stayCatalogue = new StayCatalogueApi();
