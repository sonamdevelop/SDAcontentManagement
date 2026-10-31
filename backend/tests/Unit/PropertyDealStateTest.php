<?php

use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\DealState;

it('allows only reservation transitions and identical terminal retries', function ($from, $to, $allowed) {
    expect(DealState::allows($from, $to))->toBe($allowed);
})->with([
    ['reserved', 'confirmed', true], ['reserved', 'cancelled', true], ['reserved', 'reserved', true],
    ['confirmed', 'confirmed', true], ['cancelled', 'cancelled', true], ['confirmed', 'cancelled', false],
    ['cancelled', 'confirmed', false], ['confirmed', 'reserved', false], ['cancelled', 'reserved', false],
    ['unknown', 'unknown', false], ['reserved', 'sold', false],
]);

it('maps deal state and purpose to the correct inventory status', function ($state, $purpose, $expected) {
    expect(DealState::propertyStatus($state, $purpose))->toBe($expected);
})->with([
    ['reserved', 'sale', 'reserved'], ['reserved', 'rent', 'reserved'], ['confirmed', 'sale', 'sold'],
    ['confirmed', 'rent', 'rented'], ['cancelled', 'sale', 'available'], ['cancelled', 'rent', 'available'],
]);

it('preserves decimal precision up to the database limit without floats', function ($input, $cents, $normalized) {
    expect(DealMoney::cents($input))->toBe($cents)->and(DealMoney::normalize($input))->toBe($normalized);
})->with([
    ['0', 0, '0.00'], ['0.01', 1, '0.01'], ['0.1', 10, '0.10'], ['1234567890123.45', 123456789012345, '1234567890123.45'],
    ['9999999999999.99', 999999999999999, '9999999999999.99'], ['000001.2', 120, '1.20'],
]);

it('rejects malformed or out-of-range decimal values', function ($input) {
    expect(fn () => DealMoney::cents($input))->toThrow(InvalidArgumentException::class);
})->with(['-1', '+1', '1e3', '1.001', '10000000000000', '1,000', '.5', '1.', 'NaN', ' 1 ', "1\n"]);

it('bounds a recorded advance to a positive agreed total exactly', function ($price, $advance, $allowed) {
    expect(DealMoney::validAdvance($price, $advance))->toBe($allowed);
})->with([
    ['0', '0', false], ['0.01', '0', true], ['0.01', '0.01', true], ['0.01', '0.02', false],
    ['9999999999999.99', '9999999999999.98', true], ['9999999999999.98', '9999999999999.99', false],
]);
