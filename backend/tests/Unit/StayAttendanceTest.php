<?php

use Webkul\Property\Support\StayAttendance;

it('allows arrival only inside confirmed half-open booked dates', function () {
    expect(StayAttendance::canArrive('confirmed', '2027-01-01', '2027-01-03', '2027-01-01'))->toBeTrue()
        ->and(StayAttendance::canArrive('confirmed', '2027-01-01', '2027-01-03', '2027-01-02'))->toBeTrue()
        ->and(StayAttendance::canArrive('confirmed', '2027-01-01', '2027-01-03', '2026-12-31'))->toBeFalse()
        ->and(StayAttendance::canArrive('confirmed', '2027-01-01', '2027-01-03', '2027-01-03'))->toBeFalse()
        ->and(StayAttendance::canArrive('cancelled', '2027-01-01', '2027-01-03', '2027-01-01'))->toBeFalse();
});
it('derives attendance independently of booking financial status', function () {
    expect(StayAttendance::status(false, false))->toBe('not_arrived')
        ->and(StayAttendance::status(true, false))->toBe('checked_in')
        ->and(StayAttendance::status(true, true))->toBe('checked_out');
});
