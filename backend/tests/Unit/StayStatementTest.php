<?php

use Webkul\Property\Support\StayStatement;

function statementBooking(): array
{
    return ['id' => 1, 'room_type_id' => 2, 'stay_name' => 'Stay', 'room_name' => 'Deluxe', 'guest_name' => 'Guest', 'timezone' => 'Asia/Kolkata', 'check_in' => '2030-01-01', 'check_out' => '2030-01-03', 'rooms' => 1, 'guests' => 2, 'nightly_rate' => '100.00', 'total' => '200.00', 'advance' => '100.00', 'currency' => 'INR', 'status' => 'confirmed', 'notes' => 'secret notes', 'payment_reference' => 'secret reference', 'guest_email' => 'secret@example.test'];
}
it('keeps corrections visible while deriving exact effective totals without internal metadata', function () {
    $entries = [];
    foreach ([['opening_advance', '100.00', null], ['refund', '25.01', null], ['reversal', '25.01', 2]] as $i => [$kind, $amount, $target]) {
        $entries[] = ['id' => $i + 1, 'kind' => $kind, 'amount' => $amount, 'method' => 'cash', 'created_at' => '2030-01-01T00:00:00Z', 'reversal_of' => $target, 'reason' => 'secret reason', 'reference' => 'secret bank reference', 'actor_id' => 88];
    }
    $result = StayStatement::make(statementBooking(), $entries, '2030-01-02T00:00:00Z');
    expect($result['summary']['net_paid'])->toBe('100.00')->and($result['entries'][1]['reversed_by'])->toBe(3)->and(array_column($result['entries'], 'effective'))->toBe([true, false, false]);
    expect(json_encode($result))->not->toContain('secret', 'actor_id', 'payment_reference');
});
it('preserves maximum precision and cancelled refund balances without inventing payments', function () {
    $booking = statementBooking();
    $booking['total'] = '9999999999999.99';
    $entries = [['id' => 1, 'kind' => 'payment', 'amount' => '9999999999999.98', 'method' => 'cash', 'created_at' => '2030-01-01T00:00:00Z', 'reversal_of' => null]];
    expect(StayStatement::make($booking, $entries, '2030-01-02T00:00:00Z')['summary']['balance'])->toBe('0.01');
    $booking['status'] = 'cancelled';
    expect(StayStatement::make($booking, $entries, '2030-01-02T00:00:00Z')['summary']['refund_due'])->toBe('9999999999999.98');
    expect(StayStatement::make($booking, [], '2030-01-02T00:00:00Z')['entries'])->toBe([]);
});
