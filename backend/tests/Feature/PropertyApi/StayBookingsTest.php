<?php

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayBookingEvent;

uses(DatabaseTransactions::class);
function stayFixture($actor): array
{
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'River stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Deluxe', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true]);
    $in = now('Asia/Kolkata')->addDays(5)->format('Y-m-d');
    $out = now('Asia/Kolkata')->addDays(7)->format('Y-m-d');

    return [$stay, $room, ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => $in, 'check_out' => $out, 'rooms' => 2, 'guests' => 4, 'guest_name' => 'Guest', 'guest_email' => 'guest@example.test', 'expected_rate' => '1000.25', 'advance' => '100.01']];
}
function stayHeaders($actor, array $abilities = ['stays:read', 'stays:write', 'bookings:read', 'bookings:write']): array
{
    return ['Authorization' => 'Bearer '.$actor->createToken('stay-tests', $abilities)->plainTextToken];
}
it('books exact multi-room totals, replays, cancels once and releases availability', function () {
    $actor = apiStaff([], all: true);
    [$stay,$room,$data] = stayFixture($actor);
    $h = stayHeaders($actor);
    $r = $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertCreated()->assertJsonPath('data.total', '4001.00')->assertJsonPath('data.balance', '3900.99')->assertJsonCount(1, 'data.events');
    $id = $r->json('data.id');
    $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertOk()->assertJsonPath('data.id', $id);
    $window = '?check_in='.$data['check_in'].'&check_out='.$data['check_out'];
    $this->getJson('/api/v1/admin/stay-rooms/'.$room->id.'/availability'.$window, $h)->assertOk()->assertJsonPath('data.available_rooms', 0);
    $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, ['request_id' => (string) Str::uuid()]), $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Plans changed'], $h)->assertOk()->assertJsonCount(2, 'data.events')->assertJsonPath('data.advance', '100.01');
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Other reason'], $h)->assertOk()->assertJsonPath('data.cancellation_reason', 'Plans changed')->assertJsonCount(2, 'data.events');
    $this->getJson('/api/v1/admin/stay-rooms/'.$room->id.'/availability'.$window, $h)->assertOk()->assertJsonPath('data.available_rooms', 2);
    $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertOk()->assertJsonPath('data.status', 'cancelled');
    $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, ['guest_name' => 'Other guest']), $h)->assertConflict();
});
it('enforces visibility, ACL, token abilities and private list/detail boundaries', function () {
    $owner = apiStaff([], all: true);
    [$stay,$room,$data] = stayFixture($owner);
    $h = stayHeaders($owner);
    $id = $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertCreated()->json('data.id');
    $this->getJson('/api/v1/admin/stay-bookings', $h)->assertOk()->assertJsonMissingPath('data.0.guest_email')->assertJsonMissingPath('data.0.payload_hash')->assertJsonMissingPath('data.0.request_id');
    $other = apiStaff([], all: true);
    $oh = stayHeaders($other);
    $this->getJson('/api/v1/admin/stay-bookings/'.$id, $oh)->assertNotFound();
    $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, ['request_id' => (string) Str::uuid()]), $oh)->assertNotFound();
    $this->getJson('/api/v1/admin/stays', $oh)->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/admin/stay-bookings/'.$id, stayHeaders($owner, ['bookings:write']))->assertForbidden();
    $reader = apiStaff(['stay-bookings'], visibility: 'global');
    $rh = stayHeaders($reader);
    $this->getJson('/api/v1/admin/stay-bookings', $rh)->assertOk();
    $this->getJson('/api/v1/admin/stay-bookings/'.$id, $rh)->assertForbidden();
    $this->getJson('/api/v1/admin/stay-bookings')->assertUnauthorized();
});
it('rejects invalid dates, guests, advances, stale rates and overflowing totals', function () {
    $actor = apiStaff([], all: true);
    [$stay,$room,$data] = stayFixture($actor);
    $h = stayHeaders($actor);
    foreach ([['check_out' => $data['check_in']], ['guests' => 5], ['advance' => '4001.01'], ['advance' => 100], ['expected_rate' => '1000.26'], ['check_in' => '2020-01-01'], ['check_in' => '2027-02-29']] as $change) {
        $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, $change), $h)->assertUnprocessable();
    }
    $room->update(['nightly_rate' => '9999999999999.99']);
    $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, ['expected_rate' => '9999999999999.99']), $h)->assertUnprocessable();
    expect(StayBooking::where('room_type_id', $room->id)->count())->toBe(0);
});
it('supports stay/room setup and prevents destructive inventory and timezone edits for active bookings', function () {
    $actor = apiStaff([], all: true);
    $h = stayHeaders($actor);
    $stay = $this->postJson('/api/v1/admin/stays', ['name' => 'Forest stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true], $h)->assertCreated()->json('data');
    $this->postJson('/api/v1/admin/stays/'.$stay['id'].'/rooms', ['name' => 'Family', 'inventory' => 3, 'capacity' => 4, 'nightly_rate' => '0', 'active' => true], $h)->assertUnprocessable();
    [$stay,$room,$data] = stayFixture($actor);
    $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertCreated();
    $this->putJson('/api/v1/admin/stays/'.$stay->id.'/rooms/'.$room->id, ['name' => 'Deluxe', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '1100', 'active' => true], $h)->assertUnprocessable();
    $this->putJson('/api/v1/admin/stays/'.$stay->id, ['name' => 'Renamed', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true], $h)->assertUnprocessable();
    $this->putJson('/api/v1/admin/stays/'.$stay->id.'/rooms/'.$room->id, ['name' => 'Deluxe', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '1100', 'active' => false], $h)->assertOk();
    $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, ['request_id' => (string) Str::uuid(), 'expected_rate' => '1100']), $h)->assertUnprocessable();
});
it('allows back-to-back bookings and disjoint occupancy across a longer search', function () {
    $actor = apiStaff([], all: true);
    [$stay,$room,$data] = stayFixture($actor);
    $h = stayHeaders($actor);
    $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertCreated();
    $second = array_replace($data, ['request_id' => (string) Str::uuid(), 'check_in' => $data['check_out'], 'check_out' => now('Asia/Kolkata')->addDays(9)->format('Y-m-d')]);
    $this->postJson('/api/v1/admin/stay-bookings', $second, $h)->assertCreated();
    $room->update(['inventory' => 3]);
    $this->getJson('/api/v1/admin/stay-rooms/'.$room->id.'/availability?check_in='.$data['check_in'].'&check_out='.$second['check_out'], $h)->assertOk()->assertJsonPath('data.available_rooms', 1);
});
it('keeps booked financial snapshots after rate changes and refuses cancellation at local check-in', function () {
    $actor = apiStaff([], all: true);
    [$stay,$room,$data] = stayFixture($actor);
    $h = stayHeaders($actor);
    $id = $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertCreated()->json('data.id');
    $this->putJson('/api/v1/admin/stays/'.$stay->id.'/rooms/'.$room->id, ['name' => 'Renamed', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '2000.50', 'active' => true], $h)->assertOk();
    $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertOk()->assertJsonPath('data.room_name', 'Deluxe')->assertJsonPath('data.total', '4001.00')->assertJsonPath('data.nightly_rate', '1000.25');
    $this->travelTo(Carbon::parse($data['check_in'].' 00:01:00', 'Asia/Kolkata'), function () use ($id, $h) {
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Too late'], $h)->assertUnprocessable();
    });
    $this->getJson('/api/v1/admin/stay-bookings/'.$id, $h)->assertOk()->assertJsonPath('data.status', 'confirmed')->assertJsonCount(1, 'data.events');
});
it('rejects a reused request ID for another room and atomically rolls back when event persistence fails', function () {
    $actor = apiStaff([], all: true);
    [$stay,$room,$data] = stayFixture($actor);
    $h = stayHeaders($actor);
    $this->postJson('/api/v1/admin/stay-bookings', $data, $h)->assertCreated();
    $other = $stay->rooms()->create(['name' => 'Other', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true]);
    $this->postJson('/api/v1/admin/stay-bookings', array_replace($data, ['room_type_id' => $other->id]), $h)->assertConflict();
    $listener = static function () {
        throw new RuntimeException('Synthetic audit storage failure');
    };
    Event::listen('eloquent.creating: '.StayBookingEvent::class, $listener);
    try {
        $this->postJson('/api/v1/admin/stay-bookings',array_replace($data,['room_type_id' => $other->id, 'request_id' => (string) Str::uuid()]),$h)->assertStatus(500);
    } finally {
        Event::forget('eloquent.creating: '.StayBookingEvent::class);
    }
    expect(StayBooking::where('room_type_id',$other->id)->count())->toBe(0);
});
