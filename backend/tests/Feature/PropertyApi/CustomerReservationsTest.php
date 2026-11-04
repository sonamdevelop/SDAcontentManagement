<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayBookingEvent;

uses(DatabaseTransactions::class);
function reservationFixture()
{
    $staff = apiStaff([], all: true);
    $customer = Customer::create(['name' => 'Reservation customer', 'email' => Str::uuid().'@example.test', 'phone' => '+91 9000000000', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $customer->forceFill(['email_verified_at' => now()])->save();
    $stay = Stay::create(['user_id' => $staff->id, 'name' => 'Reservable stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true, 'is_published' => true]);
    $room = $stay->rooms()->create(['name' => 'Reservable room', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true, 'is_published' => true]);
    $in = now($stay->timezone)->addDays(4)->format('Y-m-d');
    $out = now($stay->timezone)->addDays(6)->format('Y-m-d');
    $data = ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => $in, 'check_out' => $out, 'rooms' => 2, 'guests' => 4, 'guest_name' => 'Reservation guest', 'expected_rate' => '1000.25'];
    $headers = ['Authorization' => 'Bearer '.$customer->createToken('reservation', ['customer:account', 'customer:bookings', 'customer:bookings:create'], now()->addDays(30))->plainTextToken];

    return [$staff, $customer, $stay, $room, $data, $headers];
}
it('quotes and reserves exact inventory with explicit customer actor and no invented staff/payment', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff, $customer, $stay, $room, $data, $h] = reservationFixture();
    $url = '/api/v1/customer/rooms/'.$room->id.'/availability?check_in='.$data['check_in'].'&check_out='.$data['check_out'];
    $quote = $this->getJson($url, $h)->assertOk()->assertJsonPath('data.available_rooms', 2)->assertJsonPath('data.nightly_rate', '1000.25');
    expect($quote->getContent())->not->toContain('user_id', 'inventory', 'guest');
    $result = $this->postJson('/api/v1/customer/bookings', $data, $h)->assertCreated()->assertJsonPath('data.total', '4001.00')->assertJsonPath('data.advance', '0.00')->assertJsonPath('data.balance', '4001.00');
    $booking = StayBooking::findOrFail($result->json('data.id'));
    expect($booking->created_by)->toBeNull()->and($booking->customer_id)->toBe($customer->id)->and($booking->user_id)->toBe($staff->id)->and($booking->guest_email)->toBe($customer->email);
    expect($booking->events()->first()->customer_actor_id)->toBe($customer->id)->and($booking->events()->first()->actor_id)->toBeNull();
    expect($result->getContent())->not->toContain('customer_id', 'user_id', 'actor_id', $customer->email, 'payload_hash');
    $this->getJson('/api/v1/customer/bookings', $h)->assertOk()->assertJsonPath('data.0.id', $booking->id);
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.available_rooms', 0);
    $this->postJson('/api/v1/customer/bookings', array_replace($data, ['request_id' => (string) Str::uuid()]), $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/stay-bookings/'.$booking->id, apiHeaders($staff, ['bookings:read']))->assertOk()->assertJsonPath('data.events.0.customer_actor_id', $customer->id);
});
it('replays one UUID after source/profile changes and rejects changed payloads and other identities', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff, $customer, $stay, $room, $data, $h] = reservationFixture();
    $first = $this->postJson('/api/v1/customer/bookings', $data, $h)->assertCreated();
    $stay->update(['is_published' => false]);
    $room->update(['active' => false, 'nightly_rate' => '2000.00']);
    $customer->update(['name' => 'Changed profile', 'phone' => '+91 9999999999']);
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertOk()->assertJsonPath('data.id', $first->json('data.id'))->assertJsonPath('data.total', '4001.00');
    $this->postJson('/api/v1/customer/bookings', array_replace($data, ['guest_name' => 'Changed guest']), $h)->assertConflict();
    $other = Customer::create(['name' => 'Other', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $otherHeaders = ['Authorization' => 'Bearer '.$other->createToken('other', ['customer:bookings', 'customer:bookings:create'])->plainTextToken];
    $this->postJson('/api/v1/customer/bookings', $data, $otherHeaders)->assertConflict();
    expect(StayBooking::where('request_id', $data['request_id'])->count())->toBe(1)->and(StayBookingEvent::where('booking_id', $first->json('data.id'))->count())->toBe(1);
    $this->patchJson('/api/v1/admin/stay-bookings/'.$first->json('data.id').'/cancel', ['cancellation_reason' => 'Customer requested cancellation'], apiHeaders($staff, ['bookings:write']))->assertOk();
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertOk()->assertJsonPath('data.status', 'cancelled');
    expect(StayBookingEvent::where('booking_id', $first->json('data.id'))->count())->toBe(2);
});
it('enforces visible inventory, new token ability, dates, capacity, rates and prohibited authority/money fields', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff, $customer, $stay, $room, $data, $h] = reservationFixture();
    $this->postJson('/api/v1/customer/bookings', $data)->assertUnauthorized();
    $this->postJson('/api/v1/customer/bookings', $data, apiHeaders($staff, ['*']))->assertUnauthorized();
    $old = ['Authorization' => 'Bearer '.$customer->createToken('old', ['customer:bookings'])->plainTextToken];
    $this->postJson('/api/v1/customer/bookings', $data, $old)->assertForbidden();
    foreach (['customer_id' => $customer->id, 'created_by' => $staff->id, 'advance' => '10.00', 'total' => '0.01', 'guest_email' => 'override@example.test'] as $key => $value) {
        $this->postJson('/api/v1/customer/bookings', $data + [$key => $value], $h)->assertUnprocessable();
    }
    $this->postJson('/api/v1/customer/bookings', array_replace($data, ['guests' => 5]), $h)->assertUnprocessable();
    $this->postJson('/api/v1/customer/bookings', array_replace($data, ['expected_rate' => '99.00']), $h)->assertUnprocessable();
    $this->postJson('/api/v1/customer/bookings', array_replace($data, ['check_in' => '2020-01-01']), $h)->assertUnprocessable();
    $room->update(['is_published' => false]);
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertNotFound();
    $this->getJson('/api/v1/customer/rooms/'.$room->id.'/availability?check_in='.$data['check_in'].'&check_out='.$data['check_out'], $h)->assertNotFound();
    expect(StayBooking::where('room_type_id', $room->id)->count())->toBe(0);
});
it('rolls back customer ownership and allocation if recording its actor event fails', function () {
    [$staff, $customer, $stay, $room, $data, $h] = reservationFixture();
    Event::listen('eloquent.creating: '.StayBookingEvent::class, function () {
        throw new RuntimeException('Synthetic customer audit failure');
    });
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertStatus(500);
    expect(StayBooking::where('request_id', $data['request_id'])->count())->toBe(0);
});
it('rate-limits reservation attempts before any allocation', function () {
    [$staff, $customer, $stay, $room, $data, $h] = reservationFixture();
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/customer/bookings', [], $h)->assertUnprocessable();
    }
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertTooManyRequests();
});
it('does not reuse a staff-created request ID as a customer reservation', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff, $customer, $stay, $room, $data, $h] = reservationFixture();
    $staffResult = $this->postJson('/api/v1/admin/stay-bookings', $data + ['advance' => '0.00'], apiHeaders($staff, ['stays:read', 'bookings:write']))->assertCreated();
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertConflict();
    expect(StayBooking::findOrFail($staffResult->json('data.id'))->customer_id)->toBeNull();
});

it('requires verified email only for new reservation and keeps quotes and prior replay readable', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff,$customer,$stay,$room,$data,$h] = reservationFixture();
    $customer->forceFill(['email_verified_at' => null])->save();
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertUnprocessable()->assertJsonValidationErrors('email');
    $customer->forceFill(['email_verified_at' => now()])->save();
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertCreated();
    $customer->forceFill(['email_verified_at' => null])->save();
    $this->postJson('/api/v1/customer/bookings', $data, $h)->assertOk();
});
