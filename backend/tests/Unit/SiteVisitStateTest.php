<?php

use Webkul\Property\Support\SiteVisitState;

it('allows only supported visit transitions at the correct time', function ($from, $to, $started, $expected) {
    $now = new DateTimeImmutable('2026-11-01T10:00:00Z');
    $start = $now->modify($started ? '-1 minute' : '+1 minute');
    expect(SiteVisitState::allows($from, $to, $start, $now))->toBe($expected);
})->with([
    ['scheduled', 'scheduled', false, true], ['scheduled', 'cancelled', false, true], ['scheduled', 'completed', false, false], ['scheduled', 'no_show', false, false],
    ['scheduled', 'completed', true, true], ['scheduled', 'no_show', true, true], ['completed', 'scheduled', true, false], ['completed', 'cancelled', true, false],
    ['cancelled', 'completed', true, false], ['no_show', 'scheduled', true, false], ['completed', 'completed', true, true], ['cancelled', 'cancelled', false, true],
    ['unknown', 'scheduled', true, false], ['scheduled', 'unknown', true, false],
]);
it('bounds future visit windows to eight hours', function ($start, $end, $valid) {
    $now = new DateTimeImmutable('2026-11-01T10:00:00Z');
    expect(SiteVisitState::validWindow(new DateTimeImmutable($start), new DateTimeImmutable($end), $now))->toBe($valid);
})->with([
    ['2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z', false], ['2026-11-01T09:59:59Z', '2026-11-01T11:00:00Z', false],
    ['2026-11-01T11:00:00Z', '2026-11-01T11:00:00Z', false], ['2026-11-01T11:00:00Z', '2026-11-01T10:00:00Z', false],
    ['2026-11-01T11:00:00Z', '2026-11-01T19:00:00Z', true], ['2026-11-01T11:00:00Z', '2026-11-01T19:00:01Z', false],
]);
it('treats adjacent bookings as non-overlapping across timezone offsets', function ($start, $end, $overlap) {
    expect(SiteVisitState::overlaps(new DateTimeImmutable('2026-11-01T10:00:00Z'), new DateTimeImmutable('2026-11-01T11:00:00Z'), new DateTimeImmutable($start), new DateTimeImmutable($end)))->toBe($overlap);
})->with([
    ['2026-11-01T09:00:00Z', '2026-11-01T10:00:00Z', false], ['2026-11-01T11:00:00Z', '2026-11-01T12:00:00Z', false],
    ['2026-11-01T10:30:00Z', '2026-11-01T11:30:00Z', true], ['2026-11-01T09:00:00Z', '2026-11-01T12:00:00Z', true],
    ['2026-11-01T15:30:00+05:30', '2026-11-01T16:30:00+05:30', true],
]);
