<?php

use Webkul\Property\Support\CustomerStayBookingView;
use Webkul\Property\Support\StayLedger;

it('curates customer booking snapshots and exact cancelled balances without internal metadata', function () {
    $booking = ['id' => 1, 'stay_name' => 'Historic stay', 'room_name' => 'Room', 'guest_name' => 'Guest', 'timezone' => 'Asia/Kolkata', 'check_in' => '2030-01-01', 'check_out' => '2030-01-03', 'rooms' => 1, 'guests' => 2, 'nightly_rate' => '9999999999999.99', 'total' => '9999999999999.99', 'advance' => '0.00', 'currency' => 'INR', 'status' => 'cancelled', 'user_id' => 7, 'customer_id' => 5, 'notes' => 'Private notes', 'guest_email' => 'private@example.test', 'payment_reference' => 'Private bank reference'];
    $summary = StayLedger::totals([['id' => 1, 'kind' => 'payment', 'amount' => '9999999999999.98']], $booking['total'], 'cancelled');
    $row = CustomerStayBookingView::make($booking, $summary + ['actor_id' => 7]);
    expect($row['refund_due'])->toBe('9999999999999.98')->and($row['amount_due'])->toBe('0.00')->and($row['attendance_status'])->toBe('not_arrived');
    expect(json_encode($row))->not->toContain('Private', 'private@example.test', 'actor_id', 'customer_id', 'user_id');
});
