<?php

namespace Webkul\Property\Support;

class StayReportCsv
{
    public const MAX_ROWS = 5000;

    public const COLUMNS = ['row_type', 'stay_id', 'stay_name', 'timezone', 'from', 'to_exclusive', 'as_of', 'inventory_basis', 'booking_scope', 'date', 'currency', 'booked_rooms', 'inventory_rooms', 'over_capacity', 'confirmed_bookings', 'booked_room_nights', 'inventory_room_nights', 'booked_value', 'receipts', 'refunds'];

    public static function rowCount(array $report): int
    {
        return 1 + count($report['days']) + count($report['booked_value']) + count($report['cash_movement']);
    }

    public static function write($stream, array $report): void
    {
        if (self::rowCount($report) > self::MAX_ROWS) {
            throw new \LengthException('Too many report rows.');
        }
        $c = $report['context'];
        $base = ['stay_id' => $c['stay_id'], 'stay_name' => AgentReportCsv::text($c['stay_name']), 'timezone' => AgentReportCsv::text($c['timezone']), 'from' => $c['from'], 'to_exclusive' => $c['to'], 'as_of' => $c['as_of'], 'inventory_basis' => $c['inventory_basis'], 'booking_scope' => $c['booking_scope']];
        fwrite($stream, "\xEF\xBB\xBF");
        fputcsv($stream, self::COLUMNS, ',', '"', '', "\r\n");
        $write = function (array $values) use ($stream, $base) {
            $row = $base + $values;
            fputcsv($stream, array_map(fn ($key) => $row[$key] ?? '', self::COLUMNS), ',', '"', '', "\r\n");
        };
        $write(['row_type' => 'summary'] + $report['summary']);
        foreach ($report['days'] as $day) {
            $write(['row_type' => 'night', 'date' => $day['date'], 'booked_rooms' => $day['booked_rooms'], 'inventory_rooms' => $day['inventory_rooms'], 'over_capacity' => $day['over_capacity'] ? 'yes' : 'no']);
        }
        foreach ($report['booked_value'] as $value) {
            $write(['row_type' => 'booked_value', 'currency' => AgentReportCsv::text($value['currency']), 'booked_value' => $value['amount']]);
        }
        foreach ($report['cash_movement'] as $cash) {
            $write(['row_type' => 'cash_movement', 'currency' => AgentReportCsv::text($cash['currency']), 'receipts' => $cash['receipts'], 'refunds' => $cash['refunds']]);
        }
    }
}
