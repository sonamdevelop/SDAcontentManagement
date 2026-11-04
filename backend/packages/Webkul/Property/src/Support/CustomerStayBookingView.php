<?php

namespace Webkul\Property\Support;

class CustomerStayBookingView
{
    public static function make(array $booking, array $summary): array
    {
        $row = [];
        foreach (['id', 'room_type_id', 'stay_name', 'room_name', 'guest_name', 'timezone', 'check_in', 'check_out', 'rooms', 'guests', 'nightly_rate', 'total', 'advance', 'currency', 'status'] as $key) {
            $row[$key] = $booking[$key];
        }
        foreach (['checked_in_at', 'checked_out_at'] as $key) {
            $row[$key] = $booking[$key] ?? null;
        }
        $row['attendance_status'] = StayAttendance::status($row['checked_in_at'] !== null, $row['checked_out_at'] !== null);

        return $row + array_intersect_key($summary, array_flip(['received_total', 'refunded_total', 'net_paid', 'amount_due', 'balance', 'refund_due']));
    }
}
