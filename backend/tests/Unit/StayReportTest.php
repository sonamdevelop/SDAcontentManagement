<?php

use Webkul\Property\Support\StayReport;

it('counts civil room nights, excludes checkout and exposes current capacity conflicts', function () {
    $days = StayReport::days([
        ['check_in' => '2026-03-07', 'check_out' => '2026-03-09', 'rooms' => 2],
        ['check_in' => '2026-03-09', 'check_out' => '2026-03-11', 'rooms' => 1],
    ], '2026-03-08', '2026-03-10', 1);
    expect(array_column($days, 'booked_rooms'))->toBe([2, 1]);
    expect(array_column($days, 'over_capacity'))->toBe([true, false]);
    expect(array_column($days, 'date'))->toBe(['2026-03-08', '2026-03-09']);
});
it('normalizes signed exact aggregate decimals without floating point', function () {
    expect(StayReport::money('99999999999999999.99'))->toBe('99999999999999999.99');
    expect(StayReport::money('-0001.1'))->toBe('-1.10');
    expect(StayReport::money('-0.00'))->toBe('0.00');
    expect(fn () => StayReport::money('1e2'))->toThrow(UnexpectedValueException::class);
    expect(fn () => StayReport::days([], '2030-01-01', '2030-04-01', 0))->toThrow(InvalidArgumentException::class);
});
