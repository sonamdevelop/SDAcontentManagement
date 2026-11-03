<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayPayment;
use Webkul\Property\Repositories\StayPaymentRepository;

uses(DatabaseTransactions::class);
function followUpBooking($actor, $stay, array $changes = [])
{
    $room = $stay->rooms()->first() ?? $stay->rooms()->create(['name' => 'Follow-up room', 'inventory' => 5, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);

    return StayBooking::create(array_replace(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'fixture'), 'room_type_id' => $room->id, 'user_id' => $actor->id, 'created_by' => $actor->id, 'stay_name' => $stay->name, 'room_name' => $room->name, 'timezone' => $stay->timezone, 'check_in' => '2030-01-02', 'check_out' => '2030-01-04', 'rooms' => 1, 'guests' => 2, 'guest_name' => 'Follow-up guest', 'guest_email' => 'secret-followup@example.test', 'nightly_rate' => '100.00', 'total' => '200.01', 'advance' => '0.00', 'currency' => 'INR', 'payment_reference' => 'Secret reference', 'status' => 'confirmed'], $changes));
}
function followUpEntry($booking, string $kind, string $amount, ?int $reversal = null)
{
    return StayPayment::create(['booking_id' => $booking->id, 'request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'entry'), 'kind' => $kind, 'amount' => $amount, 'currency' => $booking->currency, 'method' => 'cash', 'reversal_of' => $reversal, 'actor_id' => $booking->created_by]);
}
it('queues exact outstanding collections and cancelled refunds using effective ledger entries', function () {
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Finance stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => false]);
    $unpaid = followUpBooking($actor, $stay);
    $partial = followUpBooking($actor, $stay);
    followUpEntry($partial, 'opening_advance', '100.00');
    followUpEntry($partial, 'payment', '100.00');
    $cancelled = followUpBooking($actor, $stay, ['status' => 'cancelled']);
    followUpEntry($cancelled, 'opening_advance', '100.00');
    $refund = followUpEntry($cancelled, 'refund', '25.01');
    $wrong = followUpEntry($cancelled, 'refund', '10.00');
    followUpEntry($cancelled, 'reversal', '10.00', $wrong->id);
    $settled = followUpBooking($actor, $stay);
    followUpEntry($settled, 'payment', '200.01');
    $cancelledEmpty = followUpBooking($actor, $stay, ['status' => 'cancelled']);
    $other = Stay::create(['user_id' => $actor->id, 'name' => 'Other', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    followUpBooking($actor, $other);
    $h = apiHeaders($actor, ['stays:read', 'bookings:read']);
    $url = '/api/v1/admin/stays/'.$stay->id.'/payment-follow-ups';
    $result = $this->getJson($url.'?per_page=1', $h)->assertOk()->assertJsonPath('context.counts.collection', 2)->assertJsonPath('context.counts.refund', 1)->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.id', $unpaid->id)->assertJsonPath('data.0.balance', '200.01');
    expect($result->headers->get('Cache-Control'))->toContain('no-store');
    expect($result->getContent())->not->toContain('secret-followup@example.test', 'Secret reference', 'payload_hash', 'notes');
    $this->getJson($url.'?per_page=1&page=2', $h)->assertOk()->assertJsonPath('data.0.id', $partial->id)->assertJsonPath('data.0.balance', '0.01');
    $this->getJson($url.'?view=refund', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $cancelled->id)->assertJsonPath('data.0.refund_due', '74.99')->assertJsonPath('data.0.amount_due', '0.00');
    $summary = app(StayPaymentRepository::class)->summary($cancelled);
    expect($summary['refund_due'])->toBe('74.99');
    followUpEntry($cancelled, 'refund', '74.99');
    $this->getJson($url.'?view=refund', $h)->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('context.counts.refund', 0);
});
it('enforces finance permissions, both scopes, token abilities and input limits', function () {
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Private finance', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    followUpBooking($actor, $stay);
    $url = '/api/v1/admin/stays/'.$stay->id.'/payment-follow-ups';
    $this->getJson($url)->assertUnauthorized();
    $this->getJson($url, apiHeaders($actor, ['stays:read']))->assertForbidden();
    $reader = apiStaff(['stays', 'stay-bookings', 'stay-bookings.view'], visibility: 'global');
    $this->getJson($url, apiHeaders($reader, ['stays:read', 'bookings:read']))->assertForbidden();
    $own = apiStaff([], all: true);
    $this->getJson($url, apiHeaders($own, ['stays:read', 'bookings:read']))->assertNotFound();
    // Owning the stay does not grant visibility of another actor's bookings.
    $stay->update(['user_id' => $own->id]);
    $this->getJson($url, apiHeaders($own, ['stays:read', 'bookings:read']))->assertOk()->assertJsonPath('context.counts.collection', 0)->assertJsonCount(0, 'data');
    $finance = apiStaff(['stays', 'stay-bookings', 'stay-bookings.view', 'stay-bookings.payments'], visibility: 'global');
    $h = apiHeaders($finance, ['stays:read', 'bookings:read']);
    $this->getJson($url, $h)->assertOk()->assertJsonPath('context.counts.collection', 1);
    foreach (['view=all', 'per_page=101', 'page=0'] as $bad) {
        $this->getJson($url.'?'.$bad, $h)->assertUnprocessable();
    }
});
it('matches the canonical ledger at maximum precision after reversing a payment', function () {
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Exact finance', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $booking = followUpBooking($actor, $stay, ['total' => '9999999999999.99']);
    followUpEntry($booking, 'opening_advance', '9999999999999.98');
    $receipt = followUpEntry($booking, 'payment', '0.01');
    $url = '/api/v1/admin/stays/'.$stay->id.'/payment-follow-ups';
    $h = apiHeaders($actor, ['stays:read', 'bookings:read']);
    $this->getJson($url, $h)->assertOk()->assertJsonCount(0, 'data');
    followUpEntry($booking, 'reversal', '0.01', $receipt->id);
    $result = $this->getJson($url, $h)->assertOk()->assertJsonPath('data.0.net_paid', '9999999999999.98')->assertJsonPath('data.0.balance', '0.01');
    $summary = app(StayPaymentRepository::class)->summary($booking);
    foreach (['net_paid', 'amount_due', 'balance', 'refund_due'] as $field) {
        expect($result->json('data.0.'.$field))->toBe($summary[$field]);
    }
});
