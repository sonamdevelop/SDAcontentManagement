<?php

use Carbon\CarbonImmutable;
use Webkul\Property\Support\StayOperations;

it('defaults operations dates to the stay local day across UTC midnight', function () {
    $context = StayOperations::context('Asia/Kolkata', null, CarbonImmutable::parse('2030-01-01T20:00:00Z'));
    expect($context['date'])->toBe('2030-01-02')->and($context['today'])->toBe('2030-01-02')->and($context['as_of'])->toBe('2030-01-02T01:30:00+05:30');
});
it('keeps selected scheduled date distinct from the live queue date and rejects rollover dates', function () {
    $clock = CarbonImmutable::parse('2030-01-02T10:00:00Z');
    expect(StayOperations::context('UTC', '2030-02-01', $clock))->toMatchArray(['date' => '2030-02-01', 'today' => '2030-01-02']);
    expect(fn () => StayOperations::context('UTC', '2030-02-29', $clock))->toThrow(InvalidArgumentException::class);
});
