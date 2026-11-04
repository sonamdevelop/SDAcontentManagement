<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayPayment;
use Webkul\Property\Repositories\StayReportRepository;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);
function reportStayBooking($actor, $room, array $changes = [])
{
    return StayBooking::create(array_replace(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'report'), 'room_type_id' => $room->id, 'user_id' => $actor->id, 'created_by' => $actor->id, 'stay_name' => 'Report stay', 'room_name' => $room->name, 'timezone' => 'Asia/Kolkata', 'check_in' => '2030-01-01', 'check_out' => '2030-01-04', 'rooms' => 2, 'guests' => 2, 'guest_name' => 'Secret guest', 'guest_email' => 'secret-report@example.test', 'nightly_rate' => '100.01', 'total' => '600.06', 'advance' => '0.00', 'currency' => 'INR', 'notes' => 'private notes', 'status' => 'confirmed'], $changes));
}
function reportStayEntry($booking, string $kind, string $amount, string $at, ?int $original = null)
{
    $entry = new StayPayment(['booking_id' => $booking->id, 'request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'report-entry'), 'kind' => $kind, 'amount' => $amount, 'currency' => $booking->currency, 'method' => 'cash', 'reference' => 'private receipt', 'reversal_of' => $original, 'actor_id' => $booking->created_by]);
    $entry->forceFill(['created_at' => $at])->save();

    return $entry;
}
it('reports clipped confirmed room nights and exact currency-separated values with event-time cash corrections', function () {
    config(['app.timezone' => 'UTC']);
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Report stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => false]);
    $room = $stay->rooms()->create(['name' => 'Report room', 'inventory' => 3, 'capacity' => 4, 'nightly_rate' => '50.00', 'active' => false]);
    $booking = reportStayBooking($actor, $room);
    reportStayBooking($actor, $room, ['currency' => 'USD', 'rooms' => 1, 'nightly_rate' => '20.01', 'check_in' => '2030-01-03', 'check_out' => '2030-01-05']);
    $cancelled = reportStayBooking($actor, $room, ['status' => 'cancelled']);
    $old = reportStayEntry($booking, 'payment', '100.01', '2030-01-01 18:29:59');
    reportStayEntry($booking, 'opening_advance', '50.01', '2030-01-01 18:30:00');
    reportStayEntry($booking, 'reversal', '100.01', '2030-01-02 00:00:00', $old->id);
    reportStayEntry($cancelled, 'refund', '10.01', '2030-01-03 18:29:59');
    reportStayEntry($booking, 'payment', '999.00', '2030-01-03 18:30:00');
    $url = '/api/v1/admin/stays/'.$stay->id.'/report?from=2030-01-02&to=2030-01-04';
    $r = $this->getJson($url, apiHeaders($actor, ['stays:read', 'bookings:read']))->assertOk()
        ->assertJsonPath('summary.booked_room_nights', 5)->assertJsonPath('summary.inventory_room_nights', 6)->assertJsonPath('summary.confirmed_bookings', 2)
        ->assertJsonPath('days.0.booked_rooms', 2)->assertJsonPath('days.1.booked_rooms', 3)
        ->assertJsonPath('booked_value.0.currency', 'INR')->assertJsonPath('booked_value.0.amount', '400.04')
        ->assertJsonPath('booked_value.1.amount', '20.01')->assertJsonPath('cash_movement.0.receipts', '-50.00')->assertJsonPath('cash_movement.0.refunds', '10.01');
    expect($r->headers->get('Cache-Control'))->toContain('no-store');
    expect($r->getContent())->not->toContain('secret-report@example.test', 'Secret guest', 'private receipt', 'private notes', 'payload_hash');
});
it('enforces independent stay and booking scopes plus finance roles and token abilities', function () {
    config(['app.timezone' => 'UTC']);
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Scoped report', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Room', 'inventory' => 1, 'capacity' => 4, 'nightly_rate' => '100.00', 'active' => true]);
    reportStayBooking($actor, $room);
    $url = '/api/v1/admin/stays/'.$stay->id.'/report?from=2030-01-02&to=2030-01-04';
    $this->getJson($url)->assertUnauthorized();
    $this->getJson($url, apiHeaders($actor, ['stays:read']))->assertForbidden();
    $reader = apiStaff(['stays', 'stay-bookings', 'stay-bookings.view'], visibility: 'global');
    $this->getJson($url, apiHeaders($reader, ['stays:read', 'bookings:read']))->assertForbidden();
    $own = apiStaff([], all: true);
    $headers = apiHeaders($own, ['stays:read', 'bookings:read']);
    $this->getJson($url, $headers)->assertNotFound();
    $stay->update(['user_id' => $own->id]);
    $this->getJson($url, $headers)->assertOk()->assertJsonPath('summary.booked_room_nights', 0)->assertJsonCount(0, 'booked_value')->assertJsonCount(0, 'cash_movement');
    foreach (['from=2030-01-02', 'from=2030-01-02&to=2030-01-02', 'from=2030-01-01&to=2030-04-01', 'from=2030-02-30&to=2030-03-01'] as $query) {
        $this->getJson(strtok($url, '?').'?'.$query, $headers)->assertUnprocessable();
    }
});
it('keeps DST cash boundaries and refund reversals exact at maximum precision', function () {
    config(['app.timezone' => 'UTC']);
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'DST report', 'city' => 'Dandeli', 'timezone' => 'America/New_York', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Exact room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '1.00', 'active' => true]);
    $booking = reportStayBooking($actor, $room, ['rooms' => 1, 'nightly_rate' => '9999999999999.99', 'check_in' => '2026-03-08', 'check_out' => '2026-03-09']);
    reportStayEntry($booking, 'payment', '0.01', '2026-03-08 04:59:59');
    reportStayEntry($booking, 'payment', '9999999999999.99', '2026-03-08 05:00:00');
    $refund = reportStayEntry($booking, 'refund', '0.01', '2026-03-07 10:00:00');
    reportStayEntry($booking, 'reversal', '0.01', '2026-03-09 03:59:59', $refund->id);
    reportStayEntry($booking, 'payment', '0.02', '2026-03-09 04:00:00');
    $this->getJson('/api/v1/admin/stays/'.$stay->id.'/report?from=2026-03-08&to=2026-03-09', apiHeaders($actor, ['stays:read', 'bookings:read']))->assertOk()
        ->assertJsonPath('summary.booked_room_nights', 1)->assertJsonPath('booked_value.0.amount', '9999999999999.99')
        ->assertJsonPath('cash_movement.0.receipts', '9999999999999.99')->assertJsonPath('cash_movement.0.refunds', '-0.01');
});
it('includes team bookings but excludes outside-group records and cash', function () {
    $actor = apiStaff(['stays', 'stay-bookings', 'stay-bookings.view', 'stay-bookings.payments'], 'group');
    $team = apiStaff([], all: true);
    $outside = apiStaff([], all: true);
    $group = Group::create(['name' => 'Stay report team']);
    $group->users()->attach([$actor->id, $team->id]);
    $stay = Stay::create(['user_id' => $team->id, 'name' => 'Team report', 'city' => 'Dandeli', 'timezone' => config('app.timezone'), 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Team room', 'inventory' => 3, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);
    $allowed = reportStayBooking($team, $room, ['rooms' => 1]);
    $hidden = reportStayBooking($outside, $room);
    reportStayEntry($allowed, 'payment', '0.01', '2030-01-02 12:00:00');
    reportStayEntry($hidden, 'payment', '999.00', '2030-01-02 12:00:00');
    $this->getJson('/api/v1/admin/stays/'.$stay->id.'/report?from=2030-01-02&to=2030-01-04', apiHeaders($actor, ['stays:read', 'bookings:read']))->assertOk()
        ->assertJsonPath('summary.booked_room_nights', 2)->assertJsonPath('summary.confirmed_bookings', 1)
        ->assertJsonPath('cash_movement.0.receipts', '0.01');
});

it('downloads a fresh scoped CSV with safe names, exact corrections and no private record fields', function () {
    config(['app.timezone' => 'UTC']);
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => '=SUM(1,2)', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'CSV room', 'inventory' => 3, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);
    $booking = reportStayBooking($actor, $room, ['rooms' => 1]);
    $old = reportStayEntry($booking, 'payment', '10.01', '2030-01-01 12:00:00');
    reportStayEntry($booking, 'reversal', '10.01', '2030-01-02 12:00:00', $old->id);
    $h = apiHeaders($actor, ['stays:read', 'bookings:read']);
    $url = '/api/v1/admin/stays/'.$stay->id.'/report/export?from=2030-01-02&to=2030-01-04';
    $response = $this->getJson($url, $h)->assertOk();
    expect($response->headers->get('Content-Type'))->toContain('text/csv');
    expect($response->headers->get('Content-Disposition'))->toContain('attachment;', 'sda-stay-report-'.$stay->id.'-2030-01-02-2030-01-04.csv');
    expect($response->headers->get('Cache-Control'))->toContain('no-store');
    expect($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');
    $csv = $response->streamedContent();
    expect($csv)->toStartWith("\xEF\xBB\xBF")->toContain('200.02', '-10.01');
    expect($csv)->not->toContain('Secret guest', 'secret-report@example.test', 'private notes', 'private receipt', 'payload_hash');
    $stream = fopen('php://temp', 'w+');
    fwrite($stream, substr($csv, 3));
    rewind($stream);
    $header = fgetcsv($stream, escape: '');
    $summary = array_combine($header, fgetcsv($stream, escape: ''));
    expect($summary['stay_name'])->toBe("'=SUM(1,2)")->and($summary['booked_room_nights'])->toBe('2')->and($summary['to_exclusive'])->toBe('2030-01-04');
    fclose($stream);
    $booking->update(['status' => 'cancelled']);
    $fresh = $this->getJson($url, $h)->assertOk()->streamedContent();
    expect($fresh)->not->toContain("\r\nbooked_value,")->toContain('cash_movement,', '-10.01');
});
it('applies export authentication, token and role permissions and both ownership scopes', function () {
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Private CSV stay', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'CSV scope room', 'inventory' => 3, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);
    reportStayBooking($actor, $room);
    $url = '/api/v1/admin/stays/'.$stay->id.'/report/export?from=2030-01-02&to=2030-01-04';
    $this->getJson($url)->assertUnauthorized();
    $this->getJson($url, apiHeaders($actor, ['stays:read']))->assertForbidden();
    $reader = apiStaff(['stays', 'stay-bookings', 'stay-bookings.view'], visibility: 'global');
    $this->getJson($url, apiHeaders($reader, ['stays:read', 'bookings:read']))->assertForbidden();
    $own = apiStaff([], all: true);
    $h = apiHeaders($own, ['stays:read', 'bookings:read']);
    $this->getJson($url, $h)->assertNotFound();
    $stay->update(['user_id' => $own->id]);
    $csv = $this->getJson($url, $h)->assertOk()->streamedContent();
    expect($csv)->not->toContain('200.02', 'cash_movement,');
    $this->getJson(strtok($url, '?').'?from=2030-01-01&to=2030-04-01', $h)->assertUnprocessable()->assertHeaderMissing('Content-Disposition');
});
it('rejects an oversized export as JSON before attachment headers or partial CSV', function () {
    $actor = apiStaff([], all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Large CSV', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $mock = Mockery::mock(StayReportRepository::class);
    $mock->shouldReceive('report')->once()->andReturn(['days' => [], 'booked_value' => array_fill(0, 5000, []), 'cash_movement' => []]);
    app()->instance(StayReportRepository::class, $mock);
    $this->getJson('/api/v1/admin/stays/'.$stay->id.'/report/export?from=2030-01-02&to=2030-01-04', apiHeaders($actor, ['stays:read', 'bookings:read']))->assertUnprocessable()->assertJsonValidationErrors('export')->assertHeaderMissing('Content-Disposition');
});
