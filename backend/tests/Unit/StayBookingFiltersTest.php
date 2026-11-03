<?php

use Illuminate\Validation\ValidationException;
use Tests\TestCase;
use Webkul\Property\Support\StayBookingFilters;

uses(TestCase::class);
it('accepts independent inclusive arrival bounds and exact booking identifiers', function () {
    expect(StayBookingFilters::validate(['arrival_from' => '2030-01-02', 'arrival_to' => '2030-01-02', 'booking_id' => '51', 'unknown' => 'ignored']))->toBe(['booking_id' => '51', 'arrival_from' => '2030-01-02', 'arrival_to' => '2030-01-02']);
    expect(StayBookingFilters::validate(['arrival_to' => '2024-02-29']))->toBe(['arrival_to' => '2024-02-29']);
    expect(StayBookingFilters::validate([]))->toBe([]);
});
it('rejects reversed bounds, impossible dates, timestamps and invalid IDs', function (array $filters) {
    expect(fn () => StayBookingFilters::validate($filters))->toThrow(ValidationException::class);
})->with([
    [['arrival_from' => '2030-01-03', 'arrival_to' => '2030-01-02']],
    [['arrival_from' => '2030-02-29']],
    [['arrival_to' => '2030-01-02T00:00:00Z']],
    [['booking_id' => 0]],
    [['booking_id' => 'abc']],
]);
