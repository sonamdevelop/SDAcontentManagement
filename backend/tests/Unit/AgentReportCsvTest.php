<?php

use Webkul\Property\Support\AgentReportCsv;
use Webkul\Property\Support\ReportPeriod;

it('quotes multiline CSV cells and neutralizes spreadsheet formulas without exposing unavailable sections', function () {
    $stream = fopen('php://temp', 'w+');
    $name = " \t=HYPERLINK(\"https://example.test\"),\nReviewer";
    $row = ['user_id' => 7, 'name' => $name, 'active' => true, 'leads' => ['total' => 3, 'open' => 1, 'won' => 1, 'lost' => 1, 'unclassified' => 0], 'site_visits' => null];
    $meta = ['period' => ['from' => '2026-06-10', 'to' => '2026-06-10', 'timezone' => 'UTC'], 'as_of' => '2026-11-04T10:00:00Z'];
    AgentReportCsv::write($stream, [$row], $meta, ['leads']);
    rewind($stream);
    expect(fread($stream, 3))->toBe("\xEF\xBB\xBF");
    $header = fgetcsv($stream, escape: '');
    $cells = fgetcsv($stream, escape: '');
    expect($cells[1])->toBe("'".$name)->and($cells[7])->toBe('3')->and(count($cells))->toBe(count($header));
    expect($header)->not->toContain('visits_total', 'email', 'lead_title');
    fclose($stream);
});

it('protects formula prefixes including control and Unicode whitespace', function ($name) {
    expect(AgentReportCsv::text($name))->toBe("'".$name);
})->with(['=1+1', '+SUM(1)', '-1+1', '@SUM(1)', "\tReviewer", "\rReviewer", "\u{FEFF}=1+1", "\u{00A0}@SUM(1)"]);

it('converts requested day boundaries into storage time including daylight-saving days', function () {
    $p = new ReportPeriod('2026-03-08', '2026-03-08', 'America/New_York', 'Asia/Kolkata');
    expect($p->start->format('Y-m-d H:i:s'))->toBe('2026-03-08 10:30:00')
        ->and($p->endExclusive->format('Y-m-d H:i:s'))->toBe('2026-03-09 09:30:00')
        ->and($p->endExclusive->getTimestamp() - $p->start->getTimestamp())->toBe(23 * 3600);
});

it('handles skipped local midnights and whole calendar days without extending the report', function ($date, $zone, $hours) {
    $period = new ReportPeriod($date, $date, $zone, 'UTC');
    expect($period->endExclusive->getTimestamp() - $period->start->getTimestamp())->toBe($hours * 3600);
})->with([['2018-11-04', 'America/Sao_Paulo', 23], ['2011-12-30', 'Pacific/Apia', 0]]);
