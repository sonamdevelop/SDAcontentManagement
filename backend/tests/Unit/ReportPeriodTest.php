<?php

use Webkul\Property\Support\ReportPeriod;

it('uses whole local calendar days including month year leap and daylight-saving boundaries', function ($from, $to, $timezone, $startUtc, $endUtc) {
    $period = new ReportPeriod($from, $to, $timezone);
    expect($period->start->utc()->format('Y-m-d H:i:s'))->toBe($startUtc)
        ->and($period->endExclusive->utc()->format('Y-m-d H:i:s'))->toBe($endUtc)
        ->and($period->toArray())->toBe(['from' => $from, 'to' => $to, 'timezone' => $timezone]);
})->with([
    ['2026-10-31', '2026-10-31', 'Asia/Kolkata', '2026-10-30 18:30:00', '2026-10-31 18:30:00'],
    ['2026-12-31', '2026-12-31', 'Asia/Kolkata', '2026-12-30 18:30:00', '2026-12-31 18:30:00'],
    ['2028-02-29', '2028-02-29', 'UTC', '2028-02-29 00:00:00', '2028-03-01 00:00:00'],
    ['2026-03-08', '2026-03-08', 'America/New_York', '2026-03-08 05:00:00', '2026-03-09 04:00:00'],
    ['2026-11-01', '2026-11-01', 'America/New_York', '2026-11-01 04:00:00', '2026-11-02 05:00:00'],
]);

it('supports unbounded and one-sided reporting periods', function ($from, $to) {
    $period = new ReportPeriod($from, $to, 'Asia/Kolkata');
    expect($period->start === null)->toBe($from === null)
        ->and($period->endExclusive === null)->toBe($to === null);
})->with([[null, null], ['2026-10-31', null], [null, '2026-10-31']]);
