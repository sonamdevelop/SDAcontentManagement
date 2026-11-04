<?php

use Webkul\Property\Support\StayBookingQuote;

it('uses exact cents for shared staff/customer quotes including the maximum price', function () {
    expect(StayBookingQuote::cents('1000.25', '1000.25', 2, 4, 2, 2))->toBe(400100);
    expect(StayBookingQuote::cents('9999999999999.99', '9999999999999.99', 1, 1, 1, 1))->toBe(999999999999999);
});
it('rejects changed rates, capacity violations and overflow before inventory is reserved', function () {
    expect(fn () => StayBookingQuote::cents('100.00', '99.99', 1, 1, 2, 1))->toThrow(InvalidArgumentException::class, 'rate-changed');
    expect(fn () => StayBookingQuote::cents('100.00', '100.00', 1, 3, 2, 1))->toThrow(InvalidArgumentException::class, 'capacity');
    expect(fn () => StayBookingQuote::cents('9999999999999.99', '9999999999999.99', 2, 2, 2, 1))->toThrow(InvalidArgumentException::class, 'amount-limit');
});
