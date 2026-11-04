import { bookingWindow, quotedTotal } from '../staff/stays';
export type CustomerAvailability = {
  room_type_id: number;
  stay_name: string;
  room_name: string;
  timezone: string;
  check_in: string;
  check_out: string;
  nights: number;
  capacity: number;
  nightly_rate: string;
  currency: string;
  available_rooms: number;
};
export type ReservationDraft = {
  room_type_id: number;
  check_in: string;
  check_out: string;
  rooms: number;
  guests: number;
  guest_name: string;
  guest_phone: string | null;
  expected_rate: string;
};
export function isCustomerAvailability(
  value: unknown,
  roomId: number,
  dates: { check_in: string; check_out: string },
): value is CustomerAvailability {
  if (!value || typeof value !== 'object') return false;
  const q = value as CustomerAvailability;
  try {
    bookingWindow(q.check_in, q.check_out);
    new Intl.DateTimeFormat('en', { timeZone: q.timezone });
    return (
      q.room_type_id === roomId &&
      typeof q.stay_name === 'string' &&
      typeof q.room_name === 'string' &&
      typeof q.timezone === 'string' &&
      q.check_in === dates.check_in &&
      q.check_out === dates.check_out &&
      q.nights ===
        (Date.parse(q.check_out + 'T00:00:00Z') - Date.parse(q.check_in + 'T00:00:00Z')) /
          86400000 &&
      Number.isSafeInteger(q.capacity) &&
      q.capacity >= 1 &&
      q.capacity <= 100 &&
      Number.isSafeInteger(q.available_rooms) &&
      q.available_rooms >= 0 &&
      q.available_rooms <= 1000 &&
      typeof q.currency === 'string' &&
      /^[A-Z]{3}$/.test(q.currency) &&
      typeof q.nightly_rate === 'string' &&
      /^\d{1,13}\.\d{2}$/.test(q.nightly_rate) &&
      BigInt(q.nightly_rate.replace('.', '')) > 0n
    );
  } catch {
    return false;
  }
}
export function reservationDraft(
  quote: CustomerAvailability,
  values: Record<string, string>,
): ReservationDraft {
  for (const key of ['rooms', 'guests'])
    if (!/^[1-9]\d*$/.test(values[key] || '') || !Number.isSafeInteger(Number(values[key])))
      throw new Error('Choose whole-number room and guest quantities.');
  const rooms = Number(values.rooms),
    guests = Number(values.guests),
    name = (values.guest_name || '').trim(),
    phone = (values.guest_phone || '').trim();
  if (rooms > quote.available_rooms || rooms > 1000)
    throw new Error('Choose rooms within the quoted availability.');
  if (guests > 10000 || guests > rooms * quote.capacity)
    throw new Error('Guest count exceeds the selected room capacity.');
  if (!name || name.length > 150 || phone.length > 30)
    throw new Error('Enter a guest name and a valid contact length.');
  quotedTotal(quote.nightly_rate, rooms, quote.nights);
  return {
    room_type_id: quote.room_type_id,
    check_in: quote.check_in,
    check_out: quote.check_out,
    rooms,
    guests,
    guest_name: name,
    guest_phone: phone || null,
    expected_rate: quote.nightly_rate,
  };
}
