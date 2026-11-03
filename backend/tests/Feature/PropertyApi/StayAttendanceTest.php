<?php

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayBookingEvent;

uses(DatabaseTransactions::class);

function attendanceFixture($test, $actor, string $in = '2030-01-02', string $out = '2030-01-04'): array
{
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Attendance stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Deluxe', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true]);
    $headers = ['Authorization' => 'Bearer '.$actor->createToken('attendance-test', ['stays:read', 'bookings:read', 'bookings:write'], Carbon::parse('2031-01-01'))->plainTextToken];
    $id = $test->postJson('/api/v1/admin/stay-bookings', ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => $in, 'check_out' => $out, 'rooms' => 1, 'guests' => 1, 'guest_name' => 'Synthetic guest', 'expected_rate' => '1000.25', 'advance' => '100.01'], $headers)->assertCreated()->assertJsonStructure(['data' => ['checked_in_at', 'checked_out_at', 'cancellation_reason', 'cancelled_at']])->assertJsonPath('data.checked_in_at', null)->assertJsonPath('data.cancellation_reason', null)->json('data.id');

    return [$id, $room, $headers];
}

it('records attendance once, preserves money and holds original inventory after early departure', function () {
    $actor = apiStaff([], all: true);
    [$id, $room, $h] = attendanceFixture($this, $actor);
    $this->travelTo(Carbon::parse('2030-01-02T05:00:00Z'), function () use ($id, $room, $h, $actor) {
        $arrival = $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', ['checked_in_at' => '1990-01-01', 'actor_id' => 999], $h)->assertOk()->assertJsonPath('data.attendance_status', 'checked_in')->assertJsonCount(2, 'data.events');
        $at = $arrival->json('data.checked_in_at');
        expect($at)->not->toBeNull();
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $h)->assertOk()->assertJsonPath('data.checked_in_at', $at)->assertJsonCount(2, 'data.events');
        $departure = $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-out', [], $h)->assertOk()->assertJsonPath('data.attendance_status', 'checked_out')->assertJsonPath('data.status', 'confirmed')->assertJsonPath('data.total', '2000.50')->assertJsonPath('data.balance', '1900.49')->assertJsonCount(3, 'data.events');
        $out = $departure->json('data.checked_out_at');
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-out', [], $h)->assertOk()->assertJsonPath('data.checked_out_at', $out)->assertJsonCount(3, 'data.events');
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $h)->assertOk()->assertJsonPath('data.attendance_status', 'checked_out')->assertJsonCount(3, 'data.events');
        $this->getJson('/api/v1/admin/stay-rooms/'.$room->id.'/availability?check_in=2030-01-03&check_out=2030-01-04', $h)->assertOk()->assertJsonPath('data.available_rooms', 0);
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Cannot cancel arrived guest'], $h)->assertUnprocessable();
        $this->getJson('/api/v1/admin/stay-bookings?attendance_status=checked_out', $h)->assertOk()->assertJsonPath('data.0.id', $id)->assertJsonMissingPath('data.0.guest_name');
        expect(StayBookingEvent::where('booking_id', $id)->where('action', 'checked_in')->first()->actor_id)->toBe($actor->id);
    });
});

it('uses the stay local date, rejects early/late arrivals and checkout without check-in', function () {
    $actor = apiStaff([], all: true);
    [$id, $room, $h] = attendanceFixture($this, $actor);
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-out', [], $h)->assertUnprocessable();
    $this->travelTo(Carbon::parse('2030-01-01T18:29:00Z'), function () use ($id, $h) {
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $h)->assertUnprocessable();
    });
    $this->travelTo(Carbon::parse('2030-01-01T18:31:00Z'), function () use ($id, $h) {
        $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $h)->assertOk()->assertJsonPath('data.attendance_status', 'checked_in');
    });
    [$late, , $lh] = attendanceFixture($this, $actor);
    $this->travelTo(Carbon::parse('2030-01-03T18:30:00Z'), function () use ($late, $lh) {
        $this->patchJson('/api/v1/admin/stay-bookings/'.$late.'/check-in', [], $lh)->assertUnprocessable();
    });
});

it('rejects cancelled bookings and enforces ACL, token write ability and own scope', function () {
    $actor = apiStaff([], all: true);
    [$id, , $h] = attendanceFixture($this, $actor);
    $other = apiStaff([], all: true);
    $oh = apiHeaders($other, ['bookings:write']);
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $oh)->assertNotFound();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], apiHeaders($actor, ['bookings:read']))->assertForbidden();
    $reader = apiStaff(['stay-bookings.view'], visibility: 'global');
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], apiHeaders($reader, ['bookings:write']))->assertForbidden();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in')->assertUnauthorized();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/cancel', ['cancellation_reason' => 'Cancelled before arrival'], $h)->assertOk();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-out', [], $h)->assertUnprocessable();
});

it('rolls back the timestamp if attendance history cannot be recorded', function () {
    $actor = apiStaff([], all: true);
    [$id, , $h] = attendanceFixture($this, $actor);
    Event::listen('eloquent.creating: '.StayBookingEvent::class, static function () {
        throw new RuntimeException('Synthetic event failure');
    });
    try {
        $this->travelTo(Carbon::parse('2030-01-02T05:00:00Z'), function () use ($id, $h) {
            $this->patchJson('/api/v1/admin/stay-bookings/'.$id.'/check-in', [], $h)->assertStatus(500);
        });
    } finally {
        Event::forget('eloquent.creating: '.StayBookingEvent::class);
    }
    expect(StayBooking::findOrFail($id)->checked_in_at)->toBeNull()
        ->and(StayBookingEvent::where('booking_id', $id)->count())->toBe(1);
});
