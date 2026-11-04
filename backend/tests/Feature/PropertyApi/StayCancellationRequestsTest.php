<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBookingEvent;
use Webkul\Property\Services\CustomerReservationService;

uses(DatabaseTransactions::class);
function cancellationFixture()
{
    $staff = apiStaff([], all: true, visibility: 'own');
    $c = Customer::create(['name' => 'Cancellation customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $c->forceFill(['email_verified_at' => now()])->save();
    $stay = Stay::create(['name' => 'Cancellation stay', 'city' => 'Dandeli', 'user_id' => $staff->id, 'timezone' => 'Asia/Kolkata', 'active' => true, 'is_published' => true]);
    $room = $stay->rooms()->create(['name' => 'Only room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true, 'is_published' => true]);
    [$b] = app(CustomerReservationService::class)->reserve($c->id, ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => now($stay->timezone)->addDays(5)->format('Y-m-d'), 'check_out' => now($stay->timezone)->addDays(7)->format('Y-m-d'), 'rooms' => 1, 'guests' => 1, 'guest_name' => 'Customer guest', 'expected_rate' => '1000.25']);
    $h = ['Authorization' => 'Bearer '.$c->createToken('cancel', ['customer:account', 'customer:bookings', 'customer:bookings:create'])->plainTextToken];

    return [$staff, $c, $stay, $room, $b, $h, ['request_id' => (string) Str::uuid(), 'reason' => 'Travel plans changed']];
}
it('keeps pending inventory and financial records unchanged then approves atomically without refunding money', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $sh = apiHeaders($staff, ['bookings:read', 'bookings:write']);
    $this->postJson('/api/v1/admin/stay-bookings/'.$b->id.'/payments', ['request_id' => (string) Str::uuid(), 'amount' => '300.00', 'method' => 'cash', 'reason' => 'Already received offline'], $sh)->assertCreated();
    $url = '/api/v1/customer/bookings/'.$b->id.'/cancellation-requests';
    $first = $this->postJson($url, $data, $h)->assertCreated()->assertJsonPath('data.status', 'pending');
    $id = $first->json('data.id');
    expect($b->fresh()->status)->toBe('confirmed');
    $this->getJson('/api/v1/customer/bookings/'.$b->id, $h)->assertOk()->assertJsonPath('data.cancellation_requests.0.reason', $data['reason'])->assertJsonPath('data.balance', '1700.50');
    $this->getJson('/api/v1/admin/stay-cancellation-requests', $sh)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('data.0.id', $id)->assertJsonPath('meta.total', 1);
    $decision = '/api/v1/admin/stay-cancellation-requests/'.$id.'/decision';
    $d = ['decision' => 'approve', 'decision_reason' => 'Approved per guest request'];
    $this->patchJson($decision, $d, $sh)->assertOk()->assertJsonPath('data.status', 'approved');
    $this->patchJson($decision, $d, $sh)->assertOk();
    $this->getJson('/api/v1/customer/bookings/'.$b->id, $h)->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.balance', '0.00')->assertJsonPath('data.refund_due', '300.00')->assertJsonPath('data.cancellation_requests.0.decision_reason', $d['decision_reason']);
    expect($b->fresh()->advance)->toBe('0.00')->and(DB::table('stay_payments')->where('booking_id', $b->id)->count())->toBe(1);
    expect($b->events()->where('action', 'cancellation_approved')->count())->toBe(1)->and($b->events()->where('action', 'cancelled')->count())->toBe(1)->and($b->events()->where('action', 'cancellation_closed')->count())->toBe(0);
    $quote = '/api/v1/customer/rooms/'.$room->id.'/availability?check_in='.$b->check_in.'&check_out='.$b->check_out;
    $this->getJson($quote, $h)->assertOk()->assertJsonPath('data.available_rooms', 1);
    $content = $first->getContent();
    expect($content)->not->toContain('payload_hash', 'request_id', 'customer_id', 'decided_by', 'guest_email');
});
it('replays a customer UUID after decisions and source changes while rejecting changed payloads and duplicate pending requests', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $url = '/api/v1/customer/bookings/'.$b->id.'/cancellation-requests';
    $first = $this->postJson($url, $data, $h)->assertCreated();
    $id = $first->json('data.id');
    $this->postJson($url, $data, $h)->assertOk()->assertJsonPath('data.id', $id);
    $this->postJson($url, array_replace($data, ['reason' => 'Different']), $h)->assertConflict();
    $this->postJson($url, array_replace($data, ['request_id' => (string) Str::uuid()]), $h)->assertConflict();
    $sh = apiHeaders($staff, ['bookings:write']);
    $d = ['decision' => 'reject', 'decision_reason' => 'Please contact the stay team'];
    $this->patchJson('/api/v1/admin/stay-cancellation-requests/'.$id.'/decision', $d, $sh)->assertOk();
    $room->update(['is_published' => false]);
    $c->forceFill(['email_verified_at' => null])->save();
    $this->postJson($url, $data, $h)->assertOk()->assertJsonPath('data.status', 'rejected');
    expect($b->fresh()->status)->toBe('confirmed');
    $this->postJson($url, array_replace($data, ['request_id' => (string) Str::uuid()]), $h)->assertCreated();
    $this->patchJson('/api/v1/admin/stay-cancellation-requests/'.$id.'/decision', array_replace($d, ['decision' => 'approve']), $sh)->assertConflict();
    $this->patchJson('/api/v1/admin/stay-cancellation-requests/'.$id.'/decision', array_replace($d, ['decision_reason' => 'Changed']), $sh)->assertConflict();
});
it('enforces explicit ownership account types abilities role permissions and booking scope', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $url = '/api/v1/customer/bookings/'.$b->id.'/cancellation-requests';
    $this->postJson($url, $data)->assertUnauthorized();
    $this->postJson($url, $data, apiHeaders($staff, ['*']))->assertUnauthorized();
    $read = ['Authorization' => 'Bearer '.$c->createToken('read', ['customer:bookings'])->plainTextToken];
    $this->postJson($url, $data, $read)->assertForbidden();
    $other = Customer::create(['name' => 'Other', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $oh = ['Authorization' => 'Bearer '.$other->createToken('other', ['customer:bookings', 'customer:bookings:create'])->plainTextToken];
    $this->postJson($url, $data, $oh)->assertNotFound();
    $id = $this->postJson($url, $data, $h)->assertCreated()->json('data.id');
    $decision = '/api/v1/admin/stay-cancellation-requests/'.$id.'/decision';
    $d = ['decision' => 'approve', 'decision_reason' => 'Approved'];
    $this->patchJson($decision, $d, $h)->assertUnauthorized();
    $this->patchJson($decision, $d, apiHeaders(apiStaff(['stay-bookings.view']), ['bookings:write']))->assertForbidden();
    $outsider = apiStaff([], all: true, visibility: 'own');
    $this->patchJson($decision, $d, apiHeaders($outsider, ['bookings:write']))->assertNotFound();
    $this->getJson('/api/v1/admin/stay-cancellation-requests', apiHeaders($outsider, ['bookings:read']))->assertOk()->assertJsonPath('meta.total', 0);
    expect($b->fresh()->status)->toBe('confirmed');
});
it('prevents late requests and approvals and closes pending requests on staff cancellation or check-in', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $id = $this->postJson('/api/v1/customer/bookings/'.$b->id.'/cancellation-requests', $data, $h)->assertCreated()->json('data.id');
    $sh = apiHeaders($staff, ['bookings:read', 'bookings:write']);
    $this->travel(5)->days();
    $sh = apiHeaders($staff, ['bookings:read', 'bookings:write']);
    $h = ['Authorization' => 'Bearer '.$c->createToken('late', ['customer:bookings', 'customer:bookings:create'])->plainTextToken];
    $this->patchJson('/api/v1/admin/stay-cancellation-requests/'.$id.'/decision', ['decision' => 'approve', 'decision_reason' => 'Too late'], $sh)->assertUnprocessable();
    $this->postJson('/api/v1/customer/bookings/'.$b->id.'/cancellation-requests', array_replace($data, ['request_id' => (string) Str::uuid()]), $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/stay-bookings/'.$b->id.'/check-in', [], $sh)->assertOk();
    expect(DB::table('stay_cancellation_requests')->where('id', $id)->value('status'))->toBe('closed');
    $this->travelBack();
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $id = $this->postJson('/api/v1/customer/bookings/'.$b->id.'/cancellation-requests', $data, $h)->assertCreated()->json('data.id');
    $this->patchJson('/api/v1/admin/stay-bookings/'.$b->id.'/cancel', ['cancellation_reason' => 'Staff cancellation'], apiHeaders($staff, ['bookings:write']))->assertOk();
    expect(DB::table('stay_cancellation_requests')->where('id', $id)->value('status'))->toBe('closed');
});
it('rolls back cancellation and decisions when the approval event cannot be recorded', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $id = $this->postJson('/api/v1/customer/bookings/'.$b->id.'/cancellation-requests', $data, $h)->assertCreated()->json('data.id');
    Event::listen('eloquent.creating: '.StayBookingEvent::class, function ($event) {
        if ($event->action === 'cancellation_approved') {
            throw new RuntimeException('Synthetic audit failure');
        }
    });
    $this->patchJson('/api/v1/admin/stay-cancellation-requests/'.$id.'/decision', ['decision' => 'approve', 'decision_reason' => 'Approved'], apiHeaders($staff, ['bookings:write']))->assertStatus(500);
    expect($b->fresh()->status)->toBe('confirmed')->and(DB::table('stay_cancellation_requests')->where('id', $id)->value('status'))->toBe('pending')->and($b->events()->where('action', 'cancelled')->count())->toBe(0);
});
it('validates reasons authority fields and rate limits repeated cancellation submissions', function () {
    [$staff,$c,$stay,$room,$b,$h,$data] = cancellationFixture();
    $url = '/api/v1/customer/bookings/'.$b->id.'/cancellation-requests';
    $this->postJson($url, array_replace($data, ['reason' => ' ']), $h)->assertUnprocessable();
    $this->postJson($url, $data + ['status' => 'approved'], $h)->assertUnprocessable();
    $this->postJson($url, array_replace($data, ['reason' => str_repeat('a', 1001)]), $h)->assertUnprocessable();
    $this->postJson($url, array_replace($data, ['request_id' => 'bad']), $h)->assertUnprocessable();
    $this->postJson($url, $data, $h)->assertCreated();
    $this->postJson($url, $data, $h)->assertTooManyRequests();
});
