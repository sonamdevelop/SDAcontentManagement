<?php

use Webkul\Property\Support\StayCalendar;

it('uses nightly occupancy with clipped ranges and back-to-back checkouts', function () {
    $days = StayCalendar::days([
        ['check_in' => '2027-01-01', 'check_out' => '2027-01-03', 'rooms' => 2],
        ['check_in' => '2027-01-03', 'check_out' => '2027-01-05', 'rooms' => 1],
    ], '2027-01-02', '2027-01-06', 3, true, '2027-01-03');
    expect(array_column($days, 'occupied_rooms'))->toBe([2, 1, 1, 0])
        ->and(array_column($days, 'available_rooms'))->toBe([1, 2, 2, 3])
        ->and(array_column($days, 'bookable'))->toBe([false, true, true, true]);
});
it('uses calendar nights across leap days and flags historical capacity reductions', function () {
    $days = StayCalendar::days([['check_in' => '2028-02-28', 'check_out' => '2028-03-01', 'rooms' => 3]], '2028-02-28', '2028-03-01', 2, true, '2028-03-02');
    expect(array_column($days, 'date'))->toBe(['2028-02-28', '2028-02-29'])->and($days[0]['over_capacity'])->toBeTrue()->and($days[0]['available_rooms'])->toBe(0);
});
it('does not offer inactive inventory or invalid date ranges', function () {
    expect(StayCalendar::days([], '2027-01-01', '2027-01-02', 3, false, '2027-01-01')[0])->toMatchArray(['available_rooms' => 0, 'bookable' => false]);
    expect(fn () => StayCalendar::days([], '2027-01-01', '2027-04-01', 1, true, '2027-01-01'))->toThrow(InvalidArgumentException::class);
    expect(fn () => StayCalendar::days([], '2027-02-29', '2027-03-01', 1, true, '2027-01-01'))->toThrow(InvalidArgumentException::class);
});
