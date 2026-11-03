import type { RoomCalendar } from '../src/staff/calendar';
export const calendar: RoomCalendar = {
  room_type_id: 2,
  stay_name: 'River stay',
  room_name: 'Deluxe',
  timezone: 'Asia/Kolkata',
  today: '2030-01-02',
  from: '2030-01-01',
  to: '2030-01-04',
  inventory: 2,
  active: true,
  days: [
    {
      date: '2030-01-01',
      occupied_rooms: 0,
      available_rooms: 2,
      bookable: false,
      over_capacity: false,
    },
    {
      date: '2030-01-02',
      occupied_rooms: 2,
      available_rooms: 0,
      bookable: false,
      over_capacity: false,
    },
    {
      date: '2030-01-03',
      occupied_rooms: 1,
      available_rooms: 1,
      bookable: true,
      over_capacity: false,
    },
  ],
};
