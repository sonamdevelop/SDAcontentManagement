<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayPayment;

uses(DatabaseTransactions::class);
function statementFixture($actor)
{
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Statement stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => false]);
    $room = $stay->rooms()->create(['name' => 'Statement room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => false]);

    return StayBooking::create(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'statement'), 'room_type_id' => $room->id, 'user_id' => $actor->id, 'created_by' => $actor->id, 'stay_name' => $stay->name, 'room_name' => $room->name, 'timezone' => $stay->timezone, 'check_in' => '2030-01-02', 'check_out' => '2030-01-04', 'rooms' => 1, 'guests' => 2, 'guest_name' => 'Statement guest', 'guest_email' => 'private-statement@example.test', 'nightly_rate' => '100.00', 'total' => '200.00', 'advance' => '0.00', 'currency' => 'INR', 'notes' => 'Private booking notes', 'status' => 'confirmed']);
}
it('returns the complete chronological snapshot with exact balances and private fields omitted', function () {
    $actor = apiStaff([], all: true);
    $booking = statementFixture($actor);
    $payment = null;
    for ($i = 0; $i < 25; $i++) {
        $payment = StayPayment::create(['booking_id' => $booking->id, 'request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'entry'), 'kind' => 'payment', 'amount' => '1.01', 'currency' => 'INR', 'method' => 'cash', 'reference' => 'Private bank reference', 'reason' => 'Private reason', 'actor_id' => $actor->id]);
    }
    $reversal = StayPayment::create(['booking_id' => $booking->id, 'request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'reverse'), 'kind' => 'reversal', 'amount' => '1.01', 'currency' => 'INR', 'method' => 'cash', 'reversal_of' => $payment->id, 'actor_id' => $actor->id]);
    $h = apiHeaders($actor, ['bookings:read']);
    $url = '/api/v1/admin/stay-bookings/'.$booking->id.'/statement';
    $result = $this->getJson($url, $h)->assertOk()->assertJsonCount(26, 'data.entries')->assertJsonPath('data.booking.guest_name', 'Statement guest')->assertJsonPath('data.summary.net_paid', '24.24')->assertJsonPath('data.summary.balance', '175.76')->assertJsonPath('data.entries.24.reversed_by', $reversal->id)->assertJsonPath('data.entries.24.effective', false)->assertJsonPath('data.entries.25.effective', false);
    expect($result->getContent())->not->toContain('Private', 'private-statement@example.test', 'payload_hash', 'actor_id', 'request_id');
    expect($result->headers->get('Cache-Control'))->toContain('no-store');
    $booking->update(['status' => 'cancelled']);
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.summary.amount_due', '0.00')->assertJsonPath('data.summary.refund_due', '24.24');
    expect(StayPayment::where('booking_id', $booking->id)->count())->toBe(26);
});
it('requires ledger and detail permissions, read ability and booking scope', function () {
    $owner = apiStaff([], all: true);
    $booking = statementFixture($owner);
    $url = '/api/v1/admin/stay-bookings/'.$booking->id.'/statement';
    $this->getJson($url)->assertUnauthorized();
    $this->getJson($url, apiHeaders($owner, ['bookings:write']))->assertForbidden();
    $other = apiStaff([], all: true);
    $this->getJson($url, apiHeaders($other, ['bookings:read']))->assertNotFound();
    foreach ([['stay-bookings.view'], ['stay-bookings.payments']] as $permissions) {
        $reader = apiStaff($permissions, visibility: 'global');
        $this->getJson($url, apiHeaders($reader, ['bookings:read']))->assertForbidden();
    }
    $reader = apiStaff(['stay-bookings.view', 'stay-bookings.payments'], visibility: 'global');
    $this->getJson($url, apiHeaders($reader, ['bookings:read']))->assertOk()->assertJsonCount(0, 'data.entries');
});
