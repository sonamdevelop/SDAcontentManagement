import { expect, it } from 'vitest';
import { calendarRange, isRoomCalendar, plusDays } from '../../src/staff/calendar';
import { calendar } from '../calendar-fixtures';
it('validates bounded date ranges and leap-day arithmetic', () => {
  expect(calendarRange('2028-02-28', '2028-03-01')).toEqual({
    from: '2028-02-28',
    to: '2028-03-01',
  });
  expect(plusDays('2028-02-28', 1)).toBe('2028-02-29');
  expect(() => calendarRange('2027-01-01', '2027-04-01')).toThrow('62');
  expect(() => calendarRange('2027-02-29', '2027-03-01')).toThrow();
});
it('rejects missing days, wrong parent, incorrect allocation and inconsistent bookable flags', () => {
  expect(isRoomCalendar(calendar, 2, calendar.from, calendar.to)).toBe(true);
  expect(
    isRoomCalendar({ ...calendar, days: calendar.days.slice(1) }, 2, calendar.from, calendar.to),
  ).toBe(false);
  expect(isRoomCalendar(calendar, 3, calendar.from, calendar.to)).toBe(false);
  expect(
    isRoomCalendar(
      { ...calendar, days: [{ ...calendar.days[0], bookable: true }, ...calendar.days.slice(1)] },
      2,
      calendar.from,
      calendar.to,
    ),
  ).toBe(false);
  expect(
    isRoomCalendar(
      {
        ...calendar,
        days: [calendar.days[0], { ...calendar.days[1], available_rooms: 1 }, calendar.days[2]],
      },
      2,
      calendar.from,
      calendar.to,
    ),
  ).toBe(false);
});
