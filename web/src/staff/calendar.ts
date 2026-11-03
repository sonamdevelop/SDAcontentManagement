import { StaffApi, StaffError } from './api';
import { bookingWindow } from './stays';
export type CalendarDay = {
  date: string;
  occupied_rooms: number;
  available_rooms: number;
  bookable: boolean;
  over_capacity: boolean;
};
export type RoomCalendar = {
  room_type_id: number;
  stay_name: string;
  room_name: string;
  timezone: string;
  today: string;
  from: string;
  to: string;
  inventory: number;
  active: boolean;
  days: CalendarDay[];
};
export function calendarRange(from: string, to: string) {
  bookingWindow(from, to);
  const nights = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000;
  if (nights > 62) throw new Error('Choose a calendar range of 1 to 62 nights.');
  return { from, to };
}
export function plusDays(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function isRoomCalendar(
  value: unknown,
  id: number,
  from: string,
  to: string,
): value is RoomCalendar {
  if (!value || typeof value !== 'object') return false;
  const v = value as RoomCalendar;
  try {
    calendarRange(from, to);
    if (
      v.room_type_id !== id ||
      v.from !== from ||
      v.to !== to ||
      typeof v.stay_name !== 'string' ||
      typeof v.room_name !== 'string' ||
      typeof v.timezone !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(v.today) ||
      !Number.isSafeInteger(v.inventory) ||
      v.inventory < 1 ||
      v.inventory > 1000 ||
      typeof v.active !== 'boolean' ||
      !Array.isArray(v.days)
    )
      return false;
    new Intl.DateTimeFormat('en', { timeZone: v.timezone });
    const count = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000;
    return (
      v.days.length === count &&
      v.days.every((d, i) => {
        const available = v.active ? Math.max(0, v.inventory - d.occupied_rooms) : 0;
        return (
          d.date === plusDays(from, i) &&
          Number.isSafeInteger(d.occupied_rooms) &&
          d.occupied_rooms >= 0 &&
          d.available_rooms === available &&
          d.over_capacity === d.occupied_rooms > v.inventory &&
          d.bookable === (v.active && d.date >= v.today && available > 0)
        );
      })
    );
  } catch {
    return false;
  }
}
export class CalendarApi {
  constructor(private api: StaffApi) {}
  async get(id: string, from: string, to: string, signal?: AbortSignal) {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) throw new StaffError(404);
    const range = calendarRange(from, to);
    const body = await this.api.request<{ data: unknown }>(
      `/admin/stay-rooms/${id}/calendar?${new URLSearchParams(range)}`,
      { signal },
    );
    if (!isRoomCalendar(body?.data, Number(id), from, to)) throw new StaffError(502);
    return body.data;
  }
}
