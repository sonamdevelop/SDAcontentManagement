import type { Operations } from '../src/staff/operations';
export const operations: Operations = {
  data: [
    {
      id: 51,
      room_type_id: 2,
      room_name: 'Deluxe',
      guest_name: 'Operations guest',
      check_in: '2030-01-02',
      check_out: '2030-01-04',
      rooms: 1,
      guests: 2,
      attendance_status: 'not_arrived',
      checked_in_at: null,
      checked_out_at: null,
    },
  ],
  meta: { current_page: 1, last_page: 1, total: 1 },
  context: {
    stay_id: 1,
    stay_name: 'River stay',
    timezone: 'Asia/Kolkata',
    date: '2030-01-02',
    today: '2030-01-02',
    as_of: '2030-01-02T10:00:00+05:30',
    view: 'arrivals',
    counts: { arrivals: 1, departures: 0, in_house: 1, overdue: 1 },
  },
};
