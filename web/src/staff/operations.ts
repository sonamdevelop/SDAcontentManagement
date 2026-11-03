import { StaffApi, StaffError, type Page } from './api';
export const OPERATION_VIEWS = ['arrivals', 'departures', 'in_house', 'overdue'] as const;
export type OperationView = (typeof OPERATION_VIEWS)[number];
export type OperationRow = {
  id: number;
  room_type_id: number;
  room_name: string;
  guest_name: string;
  check_in: string;
  check_out: string;
  rooms: number;
  guests: number;
  attendance_status: 'not_arrived' | 'checked_in' | 'checked_out';
  checked_in_at: string | null;
  checked_out_at: string | null;
};
export type Operations = Page<OperationRow> & {
  context: {
    stay_id: number;
    stay_name: string;
    timezone: string;
    date: string;
    today: string;
    as_of: string;
    view: OperationView;
    counts: Record<OperationView, number>;
  };
};
const id = (n: unknown) => Number.isSafeInteger(n) && Number(n) > 0;
export function operationDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + 'T00:00:00Z')) ||
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value
  )
    throw new Error('Choose a valid operations date.');
  return value;
}
export function isOperationRow(value: unknown): value is OperationRow {
  if (!value || typeof value !== 'object') return false;
  const r = value as OperationRow;
  try {
    operationDate(r.check_in);
    operationDate(r.check_out);
    if (r.check_out <= r.check_in) return false;
    return (
      id(r.id) &&
      id(r.room_type_id) &&
      typeof r.room_name === 'string' &&
      typeof r.guest_name === 'string' &&
      id(r.rooms) &&
      id(r.guests) &&
      [r.checked_in_at, r.checked_out_at].every(
        (t) => t === null || (typeof t === 'string' && Number.isFinite(Date.parse(t))),
      ) &&
      r.attendance_status ===
        (r.checked_out_at ? 'checked_out' : r.checked_in_at ? 'checked_in' : 'not_arrived') &&
      (!r.checked_out_at ||
        (!!r.checked_in_at && Date.parse(r.checked_out_at) >= Date.parse(r.checked_in_at)))
    );
  } catch {
    return false;
  }
}
export class OperationsApi {
  constructor(private api: StaffApi) {}
  async get(stayId: string, params: URLSearchParams, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(stayId) || !Number.isSafeInteger(Number(stayId)))
      throw new StaffError(404);
    const view = params.get('view') || 'arrivals';
    if (!OPERATION_VIEWS.includes(view as OperationView))
      throw new Error('Choose a valid operations queue.');
    if (params.get('date')) operationDate(params.get('date')!);
    const body = await this.api.request<Operations>(`/admin/stays/${stayId}/operations?${params}`, {
      signal,
    });
    const c = body?.context;
    try {
      if (
        !c ||
        c.stay_id !== Number(stayId) ||
        c.view !== view ||
        typeof c.stay_name !== 'string' ||
        typeof c.timezone !== 'string' ||
        typeof c.as_of !== 'string' ||
        !OPERATION_VIEWS.every((k) => Number.isSafeInteger(c.counts?.[k]) && c.counts[k] >= 0) ||
        !Number.isFinite(Date.parse(c.as_of))
      )
        throw new Error();
      new Intl.DateTimeFormat('en', { timeZone: c.timezone });
      operationDate(c.date);
      operationDate(c.today);
      if (params.get('date') && params.get('date') !== c.date) throw new Error();
      if (
        !Array.isArray(body.data) ||
        !body.data.every(isOperationRow) ||
        !body.meta ||
        !id(body.meta.current_page) ||
        !id(body.meta.last_page) ||
        !Number.isSafeInteger(body.meta.total) ||
        body.meta.total < 0
      )
        throw new Error();
    } catch {
      throw new StaffError(502);
    }
    return body;
  }
}
