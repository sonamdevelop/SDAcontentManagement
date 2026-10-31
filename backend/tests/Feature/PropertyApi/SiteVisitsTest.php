<?php

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Webkul\Contact\Models\Person;
use Webkul\Property\Models\SiteVisit;
use Webkul\Property\Models\SiteVisitEvent;
use Webkul\Property\Repositories\SiteVisitEventRepository;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);

it('schedules linked visits with server-derived customer snapshots and an audit event', function () {
    $actor = apiStaff([], visibility: 'global', all: true);
    [$p,$l,$person] = visitSources($actor);
    $h = apiHeaders($actor);
    $response = $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor, ['person_id' => 9999, 'created_by' => 9999, 'customer_phone' => 'spoof', 'status' => 'completed']), $h)
        ->assertCreated()->assertJsonPath('data.status', 'scheduled')->assertJsonPath('data.customer_name', 'Visit Customer')->assertJsonPath('data.customer_phone', '+91 9000000000')->assertJsonPath('data.created_by', $actor->id)->assertJsonPath('data.events.0.action', 'scheduled');
    expect(SiteVisit::sole()->person_id)->toBe($person->id);
    $this->getJson('/api/v1/admin/site-visits/'.$response->json('data.id'), $h)->assertOk();
    $this->getJson('/api/v1/admin/site-visits', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.customer_phone')->assertJsonMissingPath('data.0.customer_email')->assertJsonMissingPath('data.0.notes');
});
it('requires authentication action permissions read permission and token ability', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $data = visitPayload($p, $l, $actor);
    $this->getJson('/api/v1/admin/site-visits')->assertUnauthorized();
    $this->postJson('/api/v1/admin/site-visits', $data)->assertUnauthorized();
    $limited = apiStaff(['visits']);
    $this->postJson('/api/v1/admin/site-visits', $data, apiHeaders($limited))->assertForbidden();
    $noView = apiStaff(['visits.create', 'properties', 'leads.view']);
    $this->postJson('/api/v1/admin/site-visits', $data, apiHeaders($noView))->assertForbidden();
    $this->postJson('/api/v1/admin/site-visits', $data, apiHeaders($actor, ['visits:read']))->assertForbidden();
    $this->getJson('/api/v1/admin/site-visits', apiHeaders($actor, ['properties:read']))->assertForbidden();
});
it('requires source-record visibility and read permissions when scheduling', function () {
    $owner = apiStaff([], all: true);
    [$p,$l] = visitSources($owner);
    $other = apiStaff(['visits.create', 'visits.view', 'properties', 'leads.view']);
    $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $other), apiHeaders($other))->assertNotFound();
    $missingSourcePermission = apiStaff(['visits.create', 'visits.view'], visibility: 'global');
    $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $owner), apiHeaders($missingSourcePermission))->assertForbidden();
});
it('scopes visits by assigned agent including empty and shared groups', function () {
    $manager = apiStaff([], visibility: 'global', all: true);
    $agent = apiStaff(['visits', 'visits.view']);
    $outsider = apiStaff(['visits', 'visits.view']);
    [$p,$l] = visitSources($manager);
    $visit = $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $agent), apiHeaders($manager))->assertCreated()->json('data.id');
    $this->getJson('/api/v1/admin/site-visits/'.$visit, apiHeaders($agent))->assertOk();
    $this->getJson('/api/v1/admin/site-visits/'.$visit, apiHeaders($outsider))->assertNotFound();
    $groupActor = apiStaff(['visits', 'visits.view'], 'group');
    $h = apiHeaders($groupActor);
    $this->getJson('/api/v1/admin/site-visits', $h)->assertOk()->assertJsonCount(0, 'data');
    $group = Group::create(['name' => 'Visit team']);
    $group->users()->attach([$groupActor->id, $agent->id]);
    $this->getJson('/api/v1/admin/site-visits', $h)->assertOk()->assertJsonCount(1, 'data');
    $this->getJson('/api/v1/admin/site-visits/'.$visit, $h)->assertOk();
});
it('rejects invalid schedules before creating visit records', function ($changes, $field) {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor, $changes), apiHeaders($actor))->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(SiteVisit::count())->toBe(0)->and(SiteVisitEvent::count())->toBe(0);
})->with([
    [['property_id' => 0], 'property_id'], [['lead_id' => ['bad']], 'lead_id'], [['user_id' => 'bad'], 'user_id'],
    [['starts_at' => '2026-11-01 10:00:00'], 'starts_at'], [['starts_at' => '2026-02-30T10:00:00Z'], 'starts_at'], [['ends_at' => 'invalid'], 'ends_at'],
    [['starts_at' => '2000-01-01T10:00:00Z', 'ends_at' => '2000-01-01T11:00:00Z'], 'starts_at'],
    [['starts_at' => '2090-01-01T10:00:00Z', 'ends_at' => '2090-01-01T10:00:00Z'], 'ends_at'],
    [['starts_at' => '2090-01-01T10:00:00Z', 'ends_at' => '2090-01-01T20:00:00Z'], 'starts_at'],
    [['notes' => str_repeat('a', 5001)], 'notes'],
]);
it('rejects inactive or ineligible agents and closed or incomplete source records', function () {
    $actor = apiStaff([], visibility: 'global', all: true);
    [$p,$l] = visitSources($actor);
    $h = apiHeaders($actor);
    $inactive = apiStaff(['visits.view']);
    $inactive->update(['status' => 0]);
    $bad = apiStaff(['properties']);
    foreach ([$inactive, $bad] as $agent) {
        $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $agent), $h)->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }
    $p->update(['status' => 'sold']);
    $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor), $h)->assertUnprocessable()->assertJsonValidationErrors('property_id');
    $p->update(['status' => 'available']);
    $l->update(['closed_at' => now()]);
    $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor), $h)->assertUnprocessable()->assertJsonValidationErrors('lead_id');
    $l->update(['closed_at' => null, 'person_id' => null]);
    $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor), $h)->assertUnprocessable()->assertJsonValidationErrors('lead_id');
});
it('blocks agent property and customer slot conflicts including equivalent timezone offsets', function ($conflict) {
    $actor = apiStaff([], visibility: 'global', all: true);
    [$p,$l,$person] = visitSources($actor);
    $h = apiHeaders($actor);
    $payload = visitPayload($p, $l, $actor);
    $this->postJson('/api/v1/admin/site-visits', $payload, $h)->assertCreated();
    [$otherProperty,$otherLead] = visitSources($actor);
    $otherAgent = apiStaff(['visits.view']);
    if ($conflict === 'agent') {
        $next = visitPayload($otherProperty, $otherLead, $actor);
    } elseif ($conflict === 'property') {
        $next = visitPayload($p, $otherLead, $otherAgent);
    } else {
        $otherLead->update(['person_id' => $person->id]);
        $next = visitPayload($otherProperty, $otherLead, $otherAgent);
    }
    $next['starts_at'] = Carbon::parse($payload['starts_at'])->utc()->format('Y-m-d\TH:i:s\Z');
    $next['ends_at'] = Carbon::parse($payload['ends_at'])->utc()->format('Y-m-d\TH:i:s\Z');
    $this->postJson('/api/v1/admin/site-visits', $next, $h)->assertUnprocessable()->assertJsonValidationErrors('starts_at');
    expect(SiteVisit::count())->toBe(1);
})->with(['agent', 'property', 'customer']);
it('allows adjacent bookings and frees a cancelled slot', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $h = apiHeaders($actor);
    $data = visitPayload($p, $l, $actor);
    $first = $this->postJson('/api/v1/admin/site-visits', $data, $h)->assertCreated()->json('data.id');
    $next = Carbon::parse($data['ends_at']);
    $this->postJson('/api/v1/admin/site-visits', array_replace($data, ['starts_at' => $next->toIso8601String(), 'ends_at' => $next->copy()->addHour()->toIso8601String()]), $h)->assertCreated();
    $this->patchJson('/api/v1/admin/site-visits/'.$first.'/status', ['status' => 'cancelled', 'cancellation_reason' => 'Customer unavailable'], $h)->assertOk();
    $this->postJson('/api/v1/admin/site-visits', $data, $h)->assertCreated();
    expect(SiteVisit::count())->toBe(3);
});
it('reschedules atomically with reasons history and retry-safe counters', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $h = apiHeaders($actor);
    $data = visitPayload($p, $l, $actor);
    $id = $this->postJson('/api/v1/admin/site-visits', $data, $h)->json('data.id');
    $next = Carbon::parse($data['starts_at'])->addHours(3);
    $schedule = ['starts_at' => $next->toIso8601String(), 'ends_at' => $next->copy()->addHour()->toIso8601String(), 'reason' => 'Buyer requested later'];
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule', array_diff_key($schedule, ['reason' => 1]), $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule', $schedule, $h)->assertOk()->assertJsonPath('data.reschedule_count', 1)->assertJsonPath('data.events.1.action', 'rescheduled');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule', $schedule, $h)->assertOk()->assertJsonPath('data.reschedule_count', 1)->assertJsonCount(2, 'data.events');
});
it('prevents early completion and no-show then records terminal states and feedback', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $data = visitPayload($p, $l, $actor);
    $h = apiHeaders($actor);
    $id = $this->postJson('/api/v1/admin/site-visits', $data, $h)->json('data.id');
    foreach (['completed', 'no_show'] as $status) {
        $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => $status, 'feedback' => 'Arrived'], $h)->assertUnprocessable();
    }
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/feedback', ['feedback' => 'Too early'], $h)->assertUnprocessable();
    $this->travelTo(Carbon::parse($data['starts_at'])->addMinute());
    $h = apiHeaders($actor);
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'completed'], $h)->assertUnprocessable()->assertJsonValidationErrors('feedback');
    $done = $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'completed', 'feedback' => 'Buyer interested'], $h)->assertOk()->json('data.completed_at');
    $this->travel(5)->minutes();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'completed'], $h)->assertOk()->assertJsonPath('data.completed_at', $done)->assertJsonCount(2, 'data.events');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'cancelled', 'cancellation_reason' => 'Undo'], $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/feedback', ['feedback' => 'Buyer requested quote'], $h)->assertOk()->assertJsonPath('data.events.2.action', 'feedback_updated')->assertJsonPath('data.events.2.changes.old_feedback', 'Buyer interested');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule', ['starts_at' => now()->addDay()->toIso8601String(), 'ends_at' => now()->addDay()->addHour()->toIso8601String(), 'reason' => 'Try again'], $h)->assertUnprocessable();
});
it('requires cancellation reasons and supports no-show after the start', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $data = visitPayload($p, $l, $actor);
    $h = apiHeaders($actor);
    $id = $this->postJson('/api/v1/admin/site-visits', $data, $h)->json('data.id');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'cancelled'], $h)->assertUnprocessable()->assertJsonValidationErrors('cancellation_reason');
    $this->travelTo(Carbon::parse($data['starts_at'])->addMinute());
    $h = apiHeaders($actor);
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'no_show', 'feedback' => 'Customer absent'], $h)->assertOk()->assertJsonPath('data.status', 'no_show');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/feedback', ['feedback' => 'Customer unreachable'], $h)->assertOk();
});
it('reassigns only within permitted scope and keeps source contact snapshots immutable', function () {
    $manager = apiStaff([], visibility: 'global', all: true);
    $new = apiStaff(['visits', 'visits.view']);
    [$p,$l] = visitSources($manager);
    $h = apiHeaders($manager);
    $id = $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $manager), $h)->json('data.id');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/assignment', ['user_id' => $new->id, 'person_id' => 9999, 'property_id' => 9999], $h)->assertOk()->assertJsonPath('data.user_id', $new->id)->assertJsonPath('data.property_id', $p->id)->assertJsonPath('data.events.1.action', 'assigned');
    $this->getJson('/api/v1/admin/site-visits/'.$id, apiHeaders($new))->assertOk()->assertJsonPath('data.customer_name', 'Visit Customer');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/assignment', ['user_id' => $new->id], $h)->assertOk()->assertJsonCount(2, 'data.events');
});
it('does not silently retarget a visit if the lead contact changes', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $h = apiHeaders($actor);
    $data = visitPayload($p, $l, $actor);
    $id = $this->postJson('/api/v1/admin/site-visits', $data, $h)->json('data.id');
    $person = Person::create(['name' => 'Different customer', 'user_id' => $actor->id, 'emails' => [], 'contact_numbers' => []]);
    $l->update(['person_id' => $person->id]);
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule', ['starts_at' => now()->addDays(2)->toIso8601String(), 'ends_at' => now()->addDays(2)->addHour()->toIso8601String(), 'reason' => 'Move'], $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/site-visits/'.$id, $h)->assertJsonPath('data.customer_name', 'Visit Customer');
});
it('rolls back bookings when audit-event persistence fails', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $events = Mockery::mock(SiteVisitEventRepository::class)->makePartial();
    $events->shouldReceive('create')->once()->andThrow(new RuntimeException('Audit unavailable'));
    app()->instance(SiteVisitEventRepository::class, $events);
    $this->withoutExceptionHandling();
    expect(fn () => $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor), apiHeaders($actor)))->toThrow(RuntimeException::class);
    expect(SiteVisit::count())->toBe(0);
});
it('filters schedules and retains history when source records are removed', function () {
    $actor = apiStaff([], all: true);
    [$p,$l] = visitSources($actor);
    $h = apiHeaders($actor);
    $id = $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $actor), $h)->json('data.id');
    $this->getJson('/api/v1/admin/site-visits?status=scheduled&lead_id='.$l->id.'&per_page=1', $h)->assertOk()->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/admin/site-visits?from=2026-11-01%2010:00:00', $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/site-visits?per_page=101', $h)->assertUnprocessable();
    $p->delete();
    $l->delete();
    $this->getJson('/api/v1/admin/site-visits/'.$id, $h)->assertOk()->assertJsonPath('data.property_id', null)->assertJsonPath('data.lead_id', null)->assertJsonPath('data.customer_name', 'Visit Customer')->assertJsonCount(1, 'data.events');
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'cancelled', 'cancellation_reason' => 'Property withdrawn'], $h)->assertOk();
});
it('requires new token abilities and bounded eligible-agent selection', function () {
    $actor = apiStaff([], all: true);
    $old = apiHeaders($actor, ['leads:read', 'leads:write']);
    $this->getJson('/api/v1/admin/site-visits', $old)->assertForbidden();
    $login = $this->postJson('/api/v1/auth/login', ['email' => $actor->email, 'password' => 'Password123!', 'device_name' => 'Visit client'])->assertCreated();
    $h = ['Authorization' => 'Bearer '.$login->json('data.access_token')];
    $this->getJson('/api/v1/admin/site-visits', $h)->assertOk();
    $this->getJson('/api/v1/admin/site-visit-agents', $h)->assertOk()->assertJsonStructure(['data' => [['id', 'name']], 'meta']);
    $readOnly = apiStaff(['visits.view']);
    $this->getJson('/api/v1/admin/site-visit-agents', apiHeaders($readOnly))->assertForbidden();
});

it('rejects out-of-scope visit mutations without changing records', function () {
    $owner = apiStaff([], all: true);
    [$p,$l] = visitSources($owner);
    $id = $this->postJson('/api/v1/admin/site-visits', visitPayload($p, $l, $owner), apiHeaders($owner))->json('data.id');
    $other = apiStaff(['visits.view', 'visits.edit', 'visits.assign']);
    $h = apiHeaders($other);
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/status', ['status' => 'cancelled', 'cancellation_reason' => 'Unauthorized'], $h)->assertNotFound();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/assignment', ['user_id' => $other->id], $h)->assertNotFound();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/feedback', ['feedback' => 'Unauthorized'], $h)->assertNotFound();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule', ['starts_at' => now()->addDays(2)->toIso8601String(), 'ends_at' => now()->addDays(2)->addHour()->toIso8601String(), 'reason' => 'Unauthorized'], $h)->assertNotFound();
    expect(SiteVisit::find($id)->status)->toBe('scheduled')->and(SiteVisitEvent::where('site_visit_id', $id)->count())->toBe(1);
});

it('keeps schedules unchanged when rescheduling or reassigning would conflict', function () {
    $manager = apiStaff([], visibility: 'global', all: true);
    $other = apiStaff(['visits.view']);
    $h = apiHeaders($manager);
    [$p,$l] = visitSources($manager);
    [$p2,$l2] = visitSources($manager);
    [$p3,$l3] = visitSources($manager);
    $data = visitPayload($p, $l, $manager);
    $id = $this->postJson('/api/v1/admin/site-visits',$data,$h)->assertCreated()->json('data.id');
    $this->postJson('/api/v1/admin/site-visits',visitPayload($p2,$l2,$other),$h)->assertCreated();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/assignment',['user_id' => $other->id],$h)->assertUnprocessable();
    $start = Carbon::parse($data['starts_at'])->addHours(3);
    $end = $start->copy()->addHour();
    $this->postJson('/api/v1/admin/site-visits',visitPayload($p3,$l3,$manager,['starts_at' => $start->toIso8601String(), 'ends_at' => $end->toIso8601String()]),$h)->assertCreated();
    $this->patchJson('/api/v1/admin/site-visits/'.$id.'/schedule',['starts_at' => $start->toIso8601String(), 'ends_at' => $end->toIso8601String(), 'reason' => 'Conflicting slot'],$h)->assertUnprocessable();
    expect(SiteVisit::find($id)->reschedule_count)->toBe(0)->and(SiteVisit::find($id)->user_id)->toBe($manager->id)->and(SiteVisitEvent::where('site_visit_id',$id)->count())->toBe(1);
});
