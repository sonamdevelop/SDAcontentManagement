<?php

use Tests\TestCase;
use Webkul\Property\Http\Resources\StayPaymentFollowUpResource;
use Webkul\Property\Models\StayBooking;

uses(TestCase::class);

it('serializes exact follow-up amounts and only curated fields', function () {
    $booking = new StayBooking(['guest_name' => 'Guest', 'guest_email' => 'secret@example.test', 'payment_reference' => 'secret reference', 'notes' => 'secret notes']);
    $booking->forceFill(['id' => 1, 'net_paid' => '9999999999999.98', 'amount_due' => '9999999999999.99', 'balance' => '0.01', 'refund_due' => '0']);
    $row = (new StayPaymentFollowUpResource($booking))->toArray(null);
    expect($row['net_paid'])->toBe('9999999999999.98')->and($row['balance'])->toBe('0.01')->and($row['refund_due'])->toBe('0.00');
    expect(array_keys($row))->toBe(['id', 'room_type_id', 'room_name', 'guest_name', 'check_in', 'check_out', 'status', 'currency', 'net_paid', 'amount_due', 'balance', 'refund_due']);
});
