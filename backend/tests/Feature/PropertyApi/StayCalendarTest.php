<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;

uses(DatabaseTransactions::class);
it('shows current nightly room counts without guest or financial data and refreshes after cancellation', function () {
    $actor = apiStaff([], all: true);
    $h = apiHeaders($actor, ['stays:read', 'bookings:read', 'bookings:write']);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Calendar stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Deluxe', 'inventory' => 3, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true]);
    $id = $this->postJson('/api/v1/admin/stay-bookings', ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => '2030-01-02', 'check_out' => '2030-01-04', 'rooms' => 2, 'guests' => 2, 'guest_name' => 'Private calendar guest', 'guest_email' => 'private-calendar@example.test', 'expected_rate' => '1000.25', 'advance' => '100.01'], $h)->assertCreated()->json('data.id');
    $url = '/api/v1/admin/stay-rooms/'.$room->id.'/calendar?from=2030-01-01&to=2030-01-05';
    $calendar = $this->getJson($url, $h)->assertOk()->assertHeader('Cache-Control')->assertJsonCount(4, 'data.days')->assertJsonPath('data.days.1.occupied_rooms', 2)->assertJsonPath('data.days.1.available_rooms', 1)->assertJsonPath('data.days.3.available_rooms', 3);
    expect($calendar->headers->hasCacheControlDirective('no-store'))->toBeTrue();
    expect($calendar->getContent())->not->toContain('private-calendar@example.test', 'Private calendar guest', 'guest_email', 'advance', 'payment_reference');
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Plans changed'], $h)->assertOk();
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.days.1.available_rooms', 3);
    $room->update(['active' => false]);
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.active', false)->assertJsonPath('data.days.1.available_rooms', 0)->assertJsonPath('data.days.1.bookable', false);
    $other = apiStaff([], all: true);
    $this->getJson($url, apiHeaders($other, ['stays:read']))->assertNotFound();
    $this->getJson($url, apiHeaders($actor, ['bookings:read']))->assertForbidden();
    $reader = apiStaff(['stays'], visibility: 'global');
    $this->getJson($url, apiHeaders($reader, ['stays:read']))->assertOk();
    $this->getJson($url)->assertUnauthorized();
    $this->getJson('/api/v1/admin/stay-rooms/'.$room->id.'/calendar?from=2030-01-01&to=2031-01-01', $h)->assertUnprocessable();
});
