<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;

uses(DatabaseTransactions::class);
function finderBooking($actor, $stay, array $changes = [])
{
    $room = $stay->rooms()->first() ?? $stay->rooms()->create(['name' => 'Finder room', 'inventory' => 5, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);

    return StayBooking::create(array_replace(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'finder'), 'room_type_id' => $room->id, 'user_id' => $actor->id, 'created_by' => $actor->id, 'stay_name' => $stay->name, 'room_name' => $room->name, 'timezone' => $stay->timezone, 'check_in' => '2030-01-02', 'check_out' => '2030-01-04', 'rooms' => 1, 'guests' => 2, 'guest_name' => 'Private finder guest', 'guest_email' => 'finder-secret@example.test', 'nightly_rate' => '100.00', 'total' => '200.00', 'advance' => '0.00', 'currency' => 'INR', 'status' => 'confirmed'], $changes));
}
it('combines stay, booking, arrival, status and attendance filters with stable pagination and private list boundaries', function () {
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Finder stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => false]);
    $first = finderBooking($actor, $stay);
    $last = finderBooking($actor, $stay, ['check_in' => '2030-01-03']);
    finderBooking($actor, $stay, ['check_in' => '2030-01-01']);
    $cancelled = finderBooking($actor, $stay, ['status' => 'cancelled']);
    $otherStay = Stay::create(['user_id' => $actor->id, 'name' => 'Other finder', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    finderBooking($actor, $otherStay);
    $h = apiHeaders($actor, ['bookings:read']);
    $url = '/api/v1/admin/stay-bookings?stay_id='.$stay->id.'&arrival_from=2030-01-02&arrival_to=2030-01-03&status=confirmed&attendance_status=not_arrived&per_page=1';
    $result = $this->getJson($url, $h)->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.id', $last->id);
    expect($result->getContent())->not->toContain('Private finder guest', 'finder-secret@example.test', 'payload_hash');
    expect($result->headers->get('Cache-Control'))->toContain('no-store');
    $this->getJson($url.'&page=2', $h)->assertOk()->assertJsonPath('data.0.id', $first->id);
    $this->getJson($url.'&booking_id='.$first->id, $h)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.id', $first->id);
    $this->getJson($url.'&booking_id='.$cancelled->id, $h)->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/admin/stay-bookings?arrival_to=2030-01-01', $h)->assertOk()->assertJsonCount(1, 'data');
    $this->getJson('/api/v1/admin/stay-bookings?stay_id='.$stay->id.'&room_type_id='.$otherStay->rooms()->first()->id, $h)->assertOk()->assertJsonCount(0, 'data');
});
it('never broadens scope through finder IDs and validates bad input', function () {
    $owner = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $owner->id, 'name' => 'Own finder', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $booking = finderBooking($owner, $stay);
    $other = apiStaff([], all: true);
    $url = '/api/v1/admin/stay-bookings?stay_id='.$stay->id.'&booking_id='.$booking->id;
    $this->getJson($url, apiHeaders($other, ['bookings:read']))->assertOk()->assertJsonCount(0, 'data');
    $this->getJson($url)->assertUnauthorized();
    $this->getJson($url, apiHeaders($owner, ['stays:read']))->assertForbidden();
    $reader = apiStaff(['stay-bookings'], visibility: 'global');
    $h = apiHeaders($reader, ['bookings:read']);
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.0.id', $booking->id);
    foreach (['arrival_from=2030-02-29', 'arrival_from=2030-01-03&arrival_to=2030-01-02', 'booking_id=0', 'stay_id=0', 'arrival_to=invalid'] as $bad) {
        $this->getJson('/api/v1/admin/stay-bookings?'.$bad, $h)->assertUnprocessable();
    }
});
