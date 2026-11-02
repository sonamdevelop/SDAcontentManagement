<?php

use Webkul\Property\Support\StayDates;

it('counts calendar nights across leap days and DST without treating checkout as occupied', function () {
    expect(StayDates::nights('2028-02-28', '2028-03-01'))->toBe(2)->and(StayDates::nights('2027-03-13', '2027-03-15'))->toBe(2);
});
it('rejects impossible, reversed and excessively long windows', function ($in, $out) {
    expect(fn () => StayDates::nights($in, $out))->toThrow(InvalidArgumentException::class);
})->with([['2027-02-29', '2027-03-01'], ['2027-03-01', '2027-03-01'], ['2027-03-02', '2027-03-01'], ['2027-01-01', '2029-01-01']]);
it('uses peak nightly occupancy rather than summing adjacent bookings', function () {
    expect(StayDates::peak([['check_in' => '2027-01-01', 'check_out' => '2027-01-03', 'rooms' => 2], ['check_in' => '2027-01-03', 'check_out' => '2027-01-05', 'rooms' => 2]], '2027-01-01', '2027-01-05'))->toBe(2);
});
it('counts overlapping room quantities at the busiest night', function () {
    expect(StayDates::peak([['check_in' => '2027-01-01', 'check_out' => '2027-01-04', 'rooms' => 2], ['check_in' => '2027-01-03', 'check_out' => '2027-01-05', 'rooms' => 3]], '2027-01-02', '2027-01-06'))->toBe(5);
});
