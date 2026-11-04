<?php

use Webkul\Property\Support\StayReportCsv;

function stayCsvFixture(): array
{
    return ['context' => ['stay_id' => 7, 'stay_name' => " \t=SUM(1,2)\nRiver", 'timezone' => 'UTC', 'from' => '2030-01-02', 'to' => '2030-01-03', 'as_of' => '2026-11-04T10:00:00Z', 'inventory_basis' => 'current_all_room_types', 'booking_scope' => 'authorized_records'], 'summary' => ['confirmed_bookings' => 1, 'booked_room_nights' => 0, 'inventory_room_nights' => 0], 'days' => [['date' => '2030-01-02', 'booked_rooms' => 0, 'inventory_rooms' => 0, 'over_capacity' => false]], 'booked_value' => [['currency' => 'INR', 'amount' => '99999999999999999.99']], 'cash_movement' => [['currency' => 'INR', 'receipts' => '-0.01', 'refunds' => '0.00']]];
}
it('exports typed rows with safe quoted text, zero counts, signed exact decimals and no private fields', function () {
    $report = stayCsvFixture();
    $report['context']['email'] = 'private@example.test';
    $report['days'][0]['guest_name'] = 'Private guest';
    $stream = fopen('php://temp', 'w+');
    StayReportCsv::write($stream, $report);
    rewind($stream);
    expect(fread($stream, 3))->toBe("\xEF\xBB\xBF");
    $header = fgetcsv($stream, escape: '');
    $rows = [];
    while (($cells = fgetcsv($stream, escape: '')) !== false) {
        expect(count($cells))->toBe(count($header));
        $rows[] = array_combine($header, $cells);
    }
    expect(array_column($rows, 'row_type'))->toBe(['summary', 'night', 'booked_value', 'cash_movement']);
    expect($rows[0]['stay_name'])->toBe("'".$report['context']['stay_name']);
    expect($rows[1]['booked_rooms'])->toBe('0')->and($rows[1]['over_capacity'])->toBe('no')->and($rows[1]['booked_value'])->toBe('');
    expect($rows[2]['booked_value'])->toBe('99999999999999999.99')->and($rows[3]['receipts'])->toBe('-0.01');
    rewind($stream);
    expect(stream_get_contents($stream))->not->toContain('private@example.test', 'Private guest');
    fclose($stream);
});
it('refuses oversized exports before writing and retains summary and nights when currencies are empty', function () {
    $r = stayCsvFixture();
    $r['booked_value'] = $r['cash_movement'] = [];
    expect(StayReportCsv::rowCount($r))->toBe(2);
    $r['booked_value'] = array_fill(0, 5000, ['currency' => 'INR', 'amount' => '0.00']);
    $stream = fopen('php://temp', 'w+');
    expect(fn () => StayReportCsv::write($stream, $r))->toThrow(LengthException::class);
    expect(ftell($stream))->toBe(0);
    fclose($stream);
});
