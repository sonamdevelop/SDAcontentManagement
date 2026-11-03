<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBookingEvent;
use Webkul\Property\Models\StayPayment;

uses(DatabaseTransactions::class);
function paymentFixture($test, $actor): array
{
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Payment stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Deluxe', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true]);
    $h = apiHeaders($actor, ['stays:read', 'bookings:read', 'bookings:write']);
    $id = $test->postJson('/api/v1/admin/stay-bookings', ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => '2030-01-01', 'check_out' => '2030-01-03', 'rooms' => 1, 'guests' => 1, 'guest_name' => 'Payment guest', 'expected_rate' => '1000.25', 'advance' => '100.01', 'payment_reference' => 'Original advance receipt'], $h)->assertCreated()->json('data.id');

    return [$id, $h];
}
function receiptPayload(array $changes = []): array
{
    return array_replace(['request_id' => (string) Str::uuid(), 'amount' => '500.49', 'method' => 'upi', 'reference' => 'Offline UPI reference', 'reason' => 'Received outside this application'], $changes);
}
it('preserves opening advance and records, replays, refunds and reverses exact offline payments', function () {
    $actor = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $actor);
    $list = $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('summary.net_paid', '100.01')->assertJsonPath('data.0.kind', 'opening_advance');
    $opening = $list->json('data.0.id');
    $payload = receiptPayload();
    $payment = $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $h)->assertCreated()->assertJsonPath('summary.net_paid', '600.50')->assertJsonPath('summary.balance', '1400.00');
    $entry = $payment->json('data.id');
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $h)->assertOk()->assertJsonPath('data.id', $entry);
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', array_replace($payload, ['amount' => '500.48']), $h)->assertConflict();
    $refund = $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '25.25', 'reason' => 'Partial refund']), $h)->assertCreated()->assertJsonPath('summary.net_paid', '575.25');
    $refundId = $refund->json('data.id');
    $reverse = ['request_id' => (string) Str::uuid(), 'reason' => 'Wrong refund was recorded'];
    $reversed = $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$refundId.'/reverse', $reverse, $h)->assertCreated()->assertJsonPath('summary.net_paid', '600.50');
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$refundId.'/reverse', $reverse, $h)->assertOk()->assertJsonPath('data.id', $reversed->json('data.id'));
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$refundId.'/reverse', ['request_id' => (string) Str::uuid(), 'reason' => 'Again'], $h)->assertUnprocessable();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$reversed->json('data.id').'/reverse', ['request_id' => (string) Str::uuid(), 'reason' => 'Reverse a reversal'], $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/stay-bookings/'.$id, $h)->assertOk()->assertJsonPath('data.advance', '100.01')->assertJsonPath('data.net_paid', '600.50')->assertJsonPath('data.payment_reference', 'Original advance receipt');
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$opening.'/reverse', ['request_id' => (string) Str::uuid(), 'reason' => 'Original advance entered in error'], $h)->assertCreated()->assertJsonPath('summary.net_paid', '500.49');
    expect(StayPayment::where('booking_id', $id)->count())->toBe(5)->and(StayBookingEvent::where('booking_id', $id)->count())->toBe(5);
});
it('blocks overpayment, over-refund, invalid money and unsafe correction order', function () {
    $actor = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $actor);
    foreach (['0', '-1', '1e3', '0.001', 1900.49, '1900.50'] as $amount) {
        $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', receiptPayload(['amount' => $amount]), $h)->assertUnprocessable();
    }
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '100.02']), $h)->assertUnprocessable();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '25.25', 'reason' => '']), $h)->assertUnprocessable();
    $refund = $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '100.01']), $h)->assertCreated();
    $opening = StayPayment::where('booking_id', $id)->where('kind', 'opening_advance')->firstOrFail();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$opening->id.'/reverse', ['request_id' => (string) Str::uuid(), 'reason' => 'Would make net negative'], $h)->assertUnprocessable();
    expect($refund->json('summary.net_paid'))->toBe('0.00');
});
it('stops collecting on cancelled bookings, shows refund due and keeps cancellation separate from refund', function () {
    $actor = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $actor);
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Customer cancelled'], $h)->assertOk()->assertJsonPath('data.balance', '0.00')->assertJsonPath('data.refund_due', '100.01');
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', receiptPayload(), $h)->assertUnprocessable();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '100.01']), $h)->assertCreated()->assertJsonPath('summary.refund_due', '0.00')->assertJsonPath('summary.balance', '0.00');
    $this->getJson('/api/v1/admin/stay-bookings/'.$id, $h)->assertJsonPath('data.total', '2000.50')->assertJsonPath('data.advance', '100.01')->assertJsonPath('data.refunded_total', '100.01');
});
it('requires ledger ACL, read/write abilities and scoped booking visibility', function () {
    $owner = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $owner);
    $payload = receiptPayload();
    $reader = apiStaff(['stay-bookings.view'], visibility: 'global');
    $rh = apiHeaders($reader, ['bookings:read', 'bookings:write']);
    $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $rh)->assertForbidden();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $rh)->assertForbidden();
    $other = apiStaff([], all: true);
    $oh = apiHeaders($other, ['bookings:read', 'bookings:write']);
    $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $oh)->assertNotFound();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $oh)->assertNotFound();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, apiHeaders($owner, ['bookings:read']))->assertForbidden();
    $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments')->assertUnauthorized();
    $this->getJson('/api/v1/admin/stay-bookings', $h)->assertJsonMissingPath('data.0.payments')->assertJsonMissingPath('data.0.ledger_snapshot');
});
it('rolls back entry and financial totals if its audit event fails', function () {
    $actor = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $actor);
    Event::listen('eloquent.creating: '.StayBookingEvent::class, static function () {
        throw new RuntimeException('Synthetic event failure');
    });
    try {
        $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', receiptPayload(), $h)->assertStatus(500);
    } finally {
        Event::forget('eloquent.creating: '.StayBookingEvent::class);
    }
    expect(StayPayment::where('booking_id', $id)->count())->toBe(1);
    $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $h)->assertJsonPath('summary.net_paid', '100.01');
});
it('safely replays a receipt after cancellation and refund without collecting again', function () {
    $actor = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $actor);
    $payload = receiptPayload();
    $entry = $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $h)->assertCreated()->json('data.id');
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Cancellation'], $h)->assertOk();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '600.50']), $h)->assertCreated();
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $h)->assertOk()->assertJsonPath('data.id', $entry)->assertJsonPath('summary.net_paid', '0.00')->assertJsonPath('summary.status', 'cancelled');
    expect(StayPayment::where('booking_id', $id)->count())->toBe(3);
});
it('rejects cross-booking or cross-actor request reuse and refund reversals that would overpay', function () {
    $actor = apiStaff([], visibility: 'global', all: true);
    [$id,$h] = paymentFixture($this, $actor);
    [$otherId] = paymentFixture($this, $actor);
    $payload = receiptPayload(['amount' => '10.00']);
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, $h)->assertCreated();
    $this->postJson('/api/v1/admin/stay-bookings/'.$otherId.'/payments', $payload, $h)->assertConflict();
    $other = apiStaff([], visibility: 'global', all: true);
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $payload, apiHeaders($other, ['bookings:read', 'bookings:write']))->assertConflict();
    $refund = $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/refunds', receiptPayload(['amount' => '50.00']), $h)->assertCreated()->json('data.id');
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', receiptPayload(['amount' => '1940.49']), $h)->assertCreated()->assertJsonPath('summary.net_paid', '2000.50');
    $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments/'.$refund.'/reverse', ['request_id' => (string) Str::uuid(), 'reason' => 'Would overpay'], $h)->assertUnprocessable();
});
it('protects immutable rows, paginates history and never exposes internal request hashes', function () {
    $actor = apiStaff([], all: true);
    [$id,$h] = paymentFixture($this, $actor);
    for ($n = 0; $n < 3; $n++) {
        $this->postJson('/api/v1/admin/stay-bookings/'.$id.'/payments', receiptPayload(['amount' => '1.01']), $h)->assertCreated();
    }
    $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments?per_page=2&page=2',$h)->assertOk()->assertJsonCount(2,'data')->assertJsonPath('meta.total',4)->assertJsonPath('summary.net_paid','103.04')->assertJsonMissingPath('data.0.payload_hash')->assertJsonMissingPath('data.0.request_id');
    $entry = StayPayment::where('booking_id',$id)->firstOrFail();
    expect(fn () => $entry->update(['amount' => '999.00']))->toThrow(LogicException::class);
    expect(fn () => $entry->delete())->toThrow(LogicException::class);
});
