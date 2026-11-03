<?php

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;

uses(DatabaseTransactions::class);
function operationFixture($actor, array $changes = [], $stay = null)
{
    $stay ??= Stay::create(['user_id' => $actor->id, 'name' => 'Operations stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Operations room', 'inventory' => 5, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);
    $booking = StayBooking::create(array_replace(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'fixture'), 'room_type_id' => $room->id, 'user_id' => $actor->id, 'created_by' => $actor->id, 'stay_name' => $stay->name, 'room_name' => $room->name, 'timezone' => $stay->timezone, 'check_in' => '2030-01-02', 'check_out' => '2030-01-04', 'rooms' => 1, 'guests' => 2, 'guest_name' => 'Operations guest', 'guest_email' => 'private-ops@example.test', 'nightly_rate' => '100.00', 'total' => '200.00', 'advance' => '0.00', 'currency' => 'INR', 'payment_reference' => 'Private reference', 'status' => 'confirmed'], $changes));

    return [$stay, $booking];
}
it('returns scoped scheduled arrivals/departures and live in-house/overdue queues without financial contacts', function () {
    $actor = apiStaff([], all: true);
    [$stay, $arrival] = operationFixture($actor);
    [, $due] = operationFixture($actor, ['check_in' => '2030-01-01', 'check_out' => '2030-01-02'], $stay);
    $due->forceFill(['checked_in_at' => '2030-01-01 10:00:00'])->save();
    [, $overdue] = operationFixture($actor, ['check_in' => '2029-12-30', 'check_out' => '2030-01-01'], $stay);
    $overdue->forceFill(['checked_in_at' => '2029-12-30 10:00:00'])->save();
    [, $departed] = operationFixture($actor, ['check_in' => '2030-01-01', 'check_out' => '2030-01-02'], $stay);
    $departed->forceFill(['checked_in_at' => '2030-01-01 09:00:00', 'checked_out_at' => '2030-01-02 00:01:00'])->save();
    operationFixture($actor, ['status' => 'cancelled'], $stay);
    operationFixture($actor); // A different stay must not contribute to counts.
    $headers = apiHeaders($actor, ['stays:read', 'bookings:read']);
    $this->travelTo(Carbon::parse('2030-01-01T20:00:00Z'), function () use ($stay, $headers, $arrival, $overdue, $actor) {
        // Tokens are issued before travel, so use a long-lived test token for this clock boundary.
        $headers = ['Authorization' => 'Bearer '.$actor->createToken('operations', ['stays:read', 'bookings:read'], Carbon::parse('2031-01-01'))->plainTextToken];
        $url = '/api/v1/admin/stays/'.$stay->id.'/operations';
        $response = $this->getJson($url, $headers)->assertOk()->assertJsonPath('context.today', '2030-01-02')->assertJsonPath('context.counts.arrivals', 1)->assertJsonPath('context.counts.departures', 2)->assertJsonPath('context.counts.in_house', 2)->assertJsonPath('context.counts.overdue', 1)->assertJsonPath('data.0.id', $arrival->id);
        expect($response->getContent())->not->toContain('private-ops@example.test', 'Private reference', 'advance', 'balance', 'net_paid');
        $this->getJson($url.'?view=overdue&date=2030-02-01', $headers)->assertOk()->assertJsonPath('context.date', '2030-02-01')->assertJsonPath('data.0.id', $overdue->id);
        $this->getJson($url.'?view=departures&per_page=1', $headers)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2);
        $this->getJson($url.'?view=departures&per_page=1&page=2', $headers)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.current_page', 2);
    });
});
it('enforces stay and booking visibility, module permissions, abilities and valid filters', function () {
    $actor = apiStaff([], all: true);
    [$stay] = operationFixture($actor);
    $url = '/api/v1/admin/stays/'.$stay->id.'/operations';
    $this->getJson($url)->assertUnauthorized();
    $this->getJson($url, apiHeaders($actor, ['stays:read']))->assertForbidden();
    $other = apiStaff([], all: true);
    $this->getJson($url, apiHeaders($other, ['stays:read', 'bookings:read']))->assertNotFound();
    $reader = apiStaff(['stays', 'stay-bookings'], visibility: 'global');
    $this->getJson($url, apiHeaders($reader, ['stays:read', 'bookings:read']))->assertForbidden();
    $desk = apiStaff(['stays', 'stay-bookings', 'stay-bookings.view'], visibility: 'global');
    $this->getJson($url, apiHeaders($desk, ['stays:read', 'bookings:read']))->assertOk();
    $h = apiHeaders($actor, ['stays:read', 'bookings:read']);
    $this->getJson($url.'?view=unknown', $h)->assertUnprocessable();
    $this->getJson($url.'?date=2030-02-29', $h)->assertUnprocessable();
    $this->getJson($url.'?per_page=101', $h)->assertUnprocessable();
});
