<?php

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Webkul\Activity\Models\Activity;
use Webkul\Lead\Models\Lead;
use Webkul\Property\Models\Enquiry;
use Webkul\Property\Models\SiteVisit;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);

function reportLead($owner, ?string $stage = 'new', array $changes = []): Lead
{
    $pipeline = securityTestPipeline();
    $s = $stage === null ? null : $pipeline->stages()->firstOrCreate(['code' => $stage], ['name' => ucfirst($stage), 'sort_order' => 10, 'probability' => $stage === 'won' ? 100 : 0]);

    return Lead::create(array_replace(['title' => 'Private report lead', 'user_id' => $owner->id, 'lead_pipeline_id' => $pipeline->id, 'lead_pipeline_stage_id' => $s?->id], $changes));
}
function reportVisit($owner, string $status = 'scheduled', ?string $start = null): SiteVisit
{
    $start = Carbon::parse($start ?? now()->addDay());

    return SiteVisit::create(['user_id' => $owner->id, 'property_title' => 'Private report property', 'property_city' => 'Dandeli', 'customer_name' => 'Private customer', 'customer_email' => 'private-report@example.com', 'starts_at' => $start, 'ends_at' => $start->copy()->addHour(), 'status' => $status]);
}
function reportTask(array $leads, ?string $due, bool $done = false, string $type = 'task'): Activity
{
    $activity = Activity::create(['user_id' => $leads[0]->user_id, 'type' => $type, 'is_done' => $done, 'schedule_from' => $due, 'schedule_to' => $due]);
    foreach ($leads as $lead) {
        $lead->activities()->attach($activity->id);
    }

    return $activity;
}
function reportEnquiry($owner, $property, $lead = null): Enquiry
{
    return Enquiry::create(['user_id' => $owner->id, 'property_id' => $property->id, 'property_title' => $property->title, 'lead_id' => $lead?->id, 'submission_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', Str::uuid()), 'name' => 'Private enquiry', 'email' => 'private-enquiry@example.com', 'message' => 'Private message', 'consented_at' => now()]);
}
function reportPermissions(): array
{
    return ['property-reports', 'property-reports.agents', 'properties', 'properties.enquiries', 'leads', 'leads.view', 'visits'];
}

it('returns current status totals without exposing private record details', function () {
    $this->travelTo(now()->setDate(2026, 11, 10)->setTime(12, 0));
    $actor = apiStaff(reportPermissions());
    foreach (['available', 'sold', 'rented', 'unavailable'] as $status) {
        $p = apiProperty($actor, ['status' => $status, 'purpose' => $status === 'rented' ? 'rent' : 'sale', 'is_published' => false]);
    }
    $leads = [];
    foreach (['new', 'won', 'lost', null] as $code) {
        $leads[] = reportLead($actor, $code);
    }
    // Stage codes, rather than the legacy boolean status field, define the lead buckets.
    $leads[1]->update(['status' => 0]);
    reportEnquiry($actor, $p, $leads[0]);
    reportEnquiry($actor, $p);
    reportTask([$leads[0]], '2026-11-10 11:59:59');
    reportTask([$leads[0]], '2026-11-10 12:00:00');
    reportTask([$leads[0]], '2026-11-09 12:00:00', true);
    reportTask([$leads[0]], null);
    reportTask([$leads[0]], '2026-11-09 12:00:00', false, 'note');
    foreach (['scheduled', 'completed', 'cancelled', 'no_show'] as $status) {
        reportVisit($actor, $status);
    }
    reportVisit($actor, 'scheduled', '2026-11-10 11:00:00');
    reportVisit($actor, 'scheduled', '2026-11-10 12:00:00');
    $response = $this->getJson('/api/v1/admin/reports/overview', apiHeaders($actor))->assertOk()
        ->assertJsonPath('data.properties', ['total' => 4, 'available' => 1, 'reserved' => 0, 'sold' => 1, 'rented' => 1, 'unavailable' => 1])
        ->assertJsonPath('data.enquiries', ['total' => 2, 'linked_to_lead' => 1, 'without_lead' => 1])
        ->assertJsonPath('data.leads', ['total' => 4, 'open' => 1, 'won' => 1, 'lost' => 1, 'unclassified' => 1])
        ->assertJsonPath('data.follow_ups', ['total' => 4, 'pending' => 3, 'done' => 1, 'overdue' => 1, 'undated' => 1])
        ->assertJsonPath('data.site_visits', ['total' => 6, 'scheduled' => 3, 'completed' => 1, 'cancelled' => 1, 'no_show' => 1, 'upcoming' => 2])
        ->assertJsonPath('meta.as_of', '2026-11-10T12:00:00+05:30')
        ->assertJsonPath('meta.period', ['from' => null, 'to' => null, 'timezone' => 'Asia/Kolkata']);
    expect($response->headers->get('Cache-Control'))->toContain('no-store');
    expect($response->getContent())->not->toContain('Private', '@example.com', 'owner_phone', 'customer_email');
    $this->travelBack();
});

it('returns zero-valued permitted metrics and null for inaccessible modules', function () {
    $actor = apiStaff(['property-reports', 'properties']);
    $this->getJson('/api/v1/admin/reports/overview', apiHeaders($actor))->assertOk()
        ->assertJsonPath('data.properties.total', 0)->assertJsonPath('data.leads', null)
        ->assertJsonPath('data.enquiries', null)->assertJsonPath('data.follow_ups', null)->assertJsonPath('data.site_visits', null)
        ->assertJsonPath('meta.available_sections', ['properties']);
    $none = apiStaff(['property-reports']);
    $this->getJson('/api/v1/admin/reports/overview', apiHeaders($none))->assertOk()->assertJsonPath('meta.available_sections', []);
});

it('requires each source ACL and token ability independently', function ($section, $permission, $ability) {
    $actor = apiStaff(['property-reports', $permission]);
    $this->getJson('/api/v1/admin/reports/overview', apiHeaders($actor, ['reports:read']))->assertOk()->assertJsonPath('data.'.$section, null)->assertJsonPath('meta.available_sections', []);
    $this->getJson('/api/v1/admin/reports/overview', apiHeaders($actor, ['reports:read', $ability]))->assertOk()->assertJsonPath('data.'.$section.'.total', 0)->assertJsonPath('meta.available_sections', [$section]);
    $actor->role->update(['permissions' => ['property-reports']]);
    $this->getJson('/api/v1/admin/reports/overview', apiHeaders($actor, ['reports:read', $ability]))->assertOk()->assertJsonPath('data.'.$section, null);
})->with([
    ['properties', 'properties', 'properties:read'], ['enquiries', 'properties.enquiries', 'enquiries:read'],
    ['leads', 'leads', 'leads:read'], ['follow_ups', 'leads.view', 'leads:read'], ['site_visits', 'visits', 'visits:read'],
]);

it('protects report routes with authentication report permissions and token abilities', function ($path) {
    $this->getJson($path)->assertUnauthorized();
    $none = apiStaff(['properties', 'leads', 'visits']);
    $this->getJson($path, apiHeaders($none))->assertForbidden();
    $actor = apiStaff(reportPermissions());
    $this->getJson($path, apiHeaders($actor, ['leads:read', 'properties:read', 'visits:read']))->assertForbidden();
    $this->getJson($path, apiHeaders($actor))->assertOk();
    $actor->update(['status' => 0]);
    $this->getJson($path, apiHeaders($actor))->assertForbidden();
})->with(['/api/v1/admin/reports/overview', '/api/v1/admin/reports/agents']);

it('requires separate agent reporting permission and at least one permitted source', function () {
    $actor = apiStaff(['property-reports', 'leads']);
    $this->getJson('/api/v1/admin/reports/agents', apiHeaders($actor))->assertForbidden();
    $actor->role->update(['permissions' => ['property-reports.agents', 'leads']]);
    $this->getJson('/api/v1/admin/reports/agents', apiHeaders($actor))->assertForbidden();
    $actor->role->update(['permissions' => ['property-reports', 'property-reports.agents', 'properties']]);
    $this->getJson('/api/v1/admin/reports/agents', apiHeaders($actor))->assertForbidden();
});

it('retains own scope even for all-permission roles and cannot widen it with a user filter', function () {
    $actor = apiStaff([], all: true);
    $outsider = apiStaff([], all: true);
    foreach ([$actor, $outsider] as $user) {
        $property = apiProperty($user);
        $lead = reportLead($user);
        reportEnquiry($user, $property, $lead);
        reportTask([$lead], now()->subHour()->format('Y-m-d H:i:s'));
        reportVisit($user);
    }
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.properties.total', 1)->assertJsonPath('data.leads.total', 1)->assertJsonPath('data.enquiries.total', 1)->assertJsonPath('data.follow_ups.total', 1)->assertJsonPath('data.site_visits.total', 1);
    $this->getJson('/api/v1/admin/reports/agents', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.user_id', $actor->id);
    foreach ([$outsider->id, 99999999] as $id) {
        $this->getJson('/api/v1/admin/reports/overview?user_id='.$id, $h)->assertOk()->assertJsonPath('data.properties.total', 0)->assertJsonPath('data.leads.total', 0)->assertJsonPath('data.enquiries.total', 0)->assertJsonPath('data.follow_ups.total', 0)->assertJsonPath('data.site_visits.total', 0);
        $this->getJson('/api/v1/admin/reports/agents?user_id='.$id, $h)->assertOk()->assertJsonCount(0, 'data');
    }
});

it('keeps group and empty-group totals bounded and supports global scope', function () {
    $actor = apiStaff(reportPermissions(), 'group');
    $mate = apiStaff();
    $outsider = apiStaff();
    foreach ([$actor, $mate, $outsider] as $user) {
        $p = apiProperty($user);
        $l = reportLead($user);
        reportEnquiry($user, $p, $l);
        reportTask([$l], now()->addDay()->format('Y-m-d H:i:s'));
        reportVisit($user);
    }
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.leads.total', 0)->assertJsonPath('data.properties.total', 0)->assertJsonPath('data.follow_ups.total', 0)->assertJsonPath('data.site_visits.total', 0);
    $this->getJson('/api/v1/admin/reports/agents', $h)->assertOk()->assertJsonCount(0, 'data');
    $group = Group::create(['name' => 'Report team']);
    $group->users()->attach([$actor->id, $mate->id]);
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.leads.total', 2)->assertJsonPath('data.properties.total', 2)->assertJsonPath('data.enquiries.total', 2)->assertJsonPath('data.follow_ups.total', 2)->assertJsonPath('data.site_visits.total', 2);
    $this->getJson('/api/v1/admin/reports/agents', $h)->assertOk()->assertJsonCount(2, 'data');
    $actor->update(['view_permission' => 'global']);
    $this->getJson('/api/v1/admin/reports/overview?user_id='.$outsider->id, $h)->assertOk()->assertJsonPath('data.leads.total', 1)->assertJsonPath('data.properties.total', 1)->assertJsonPath('data.site_visits.total', 1);
});

it('applies date filters to each domain date with inclusive days and an exclusive next midnight', function () {
    $actor = apiStaff(reportPermissions());
    $h = apiHeaders($actor);
    foreach (['2026-11-09 23:59:59', '2026-11-10 00:00:00', '2026-11-10 23:59:59', '2026-11-11 00:00:00'] as $stamp) {
        $p = apiProperty($actor);
        $p->forceFill(['created_at' => $stamp])->save();
        $l = reportLead($actor);
        $l->forceFill(['created_at' => $stamp])->save();
        $e = reportEnquiry($actor, $p, $l);
        $e->forceFill(['created_at' => $stamp])->save();
        // Creation dates intentionally differ from due/start dates.
        reportTask([$l], $stamp);
        reportVisit($actor, 'scheduled', $stamp);
    }
    foreach (['from=2026-11-10&to=2026-11-10' => 2, 'from=2026-11-10' => 3, 'to=2026-11-10' => 3] as $filter => $total) {
        $response = $this->getJson('/api/v1/admin/reports/overview?'.$filter, $h)->assertOk();
        foreach (['properties', 'enquiries', 'leads', 'follow_ups', 'site_visits'] as $section) {
            $response->assertJsonPath('data.'.$section.'.total', $total);
        }
    }
    $this->getJson('/api/v1/admin/reports/agents?from=2026-11-10&to=2026-11-10', $h)->assertOk()->assertJsonPath('data.0.leads.total', 2)->assertJsonPath('data.0.site_visits.total', 2);
});

it('counts shared follow-ups once and scopes them by visible lead rather than activity author', function () {
    $actor = apiStaff(reportPermissions());
    $outsider = apiStaff();
    $own = reportLead($actor);
    $other = reportLead($outsider);
    reportTask([$own, $other], now()->subDay()->format('Y-m-d H:i:s'));
    $shared = reportTask([$own, reportLead($actor)], now()->subDay()->format('Y-m-d H:i:s'));
    $shared->update(['user_id' => $outsider->id]);
    reportTask([$other], now()->subDay()->format('Y-m-d H:i:s'));
    reportTask([$own], null);
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.follow_ups.total', 3)->assertJsonPath('data.follow_ups.overdue', 2);
    $own->update(['user_id' => $outsider->id]);
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.follow_ups.total', 1);
});

it('aggregates agents without multiplying counts and paginates in stable id order', function () {
    $actor = apiStaff(reportPermissions(), 'global');
    $first = apiStaff();
    $second = apiStaff();
    $empty = apiStaff();
    $second->update(['status' => 0]);
    reportLead($first);
    reportLead($first, 'won');
    reportLead($first, 'lost');
    reportVisit($first);
    reportVisit($first, 'completed');
    reportLead($second);
    reportVisit($second, 'no_show');
    $h = apiHeaders($actor);
    // Restrict team members explicitly through group scope to avoid seeded staff rows.
    $actor->update(['view_permission' => 'group']);
    $group = Group::create(['name' => 'Report agents']);
    $group->users()->attach([$actor->id, $first->id, $second->id, $empty->id]);
    $page = $this->getJson('/api/v1/admin/reports/agents?per_page=1', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('meta.last_page', 2)->assertJsonPath('data.0.user_id', $first->id)
        ->assertJsonPath('data.0.leads', ['total' => 3, 'open' => 1, 'won' => 1, 'lost' => 1, 'unclassified' => 0])
        ->assertJsonPath('data.0.site_visits.total', 2)->assertJsonMissingPath('data.0.email');
    expect($page->headers->get('Cache-Control'))->toContain('no-store');
    $this->getJson('/api/v1/admin/reports/agents?per_page=1&page=2', $h)->assertOk()->assertJsonPath('data.0.user_id', $second->id)->assertJsonPath('data.0.active', false)->assertJsonPath('data.0.site_visits.no_show', 1);
    $this->getJson('/api/v1/admin/reports/agents?user_id='.$first->id, $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.leads.total', 3);
});

it('returns only permitted agent metrics and excludes staff with only inaccessible records', function ($permission, $section, $hidden) {
    $actor = apiStaff(['property-reports', 'property-reports.agents', $permission], 'global');
    $leadAgent = apiStaff();
    $visitAgent = apiStaff();
    reportLead($leadAgent);
    reportVisit($visitAgent);
    $actor->update(['view_permission' => 'group']);
    $g = Group::create(['name' => 'Report source team']);
    $g->users()->attach([$actor->id, $leadAgent->id, $visitAgent->id]);
    $this->getJson('/api/v1/admin/reports/agents', apiHeaders($actor))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.'.$section.'.total', 1)->assertJsonPath('data.0.'.$hidden, null)->assertJsonPath('meta.available_sections', [$section]);
})->with([['leads', 'leads', 'site_visits'], ['visits', 'site_visits', 'leads']]);

it('rejects invalid report dates and pagination', function ($query, $field) {
    $actor = apiStaff(reportPermissions());
    foreach (['overview', 'agents'] as $endpoint) {
        $this->getJson('/api/v1/admin/reports/'.$endpoint.'?'.$query, apiHeaders($actor))->assertUnprocessable()->assertJsonValidationErrors($field);
    }
})->with([
    ['from=2026-02-30', 'from'], ['from=2026-11-01T00:00:00Z', 'from'], ['to=invalid', 'to'],
    ['from=2026-11-02&to=2026-11-01', 'to'], ['from[]=2026-11-01', 'from'],
    ['from=0001-01-01', 'from'], ['to=9999-12-31', 'to'],
    ['user_id=0', 'user_id'], ['user_id=abc', 'user_id'], ['per_page=101', 'per_page'], ['page=0', 'page'],
]);

it('requires renewed tokens to use reports and grants the ability on login', function () {
    $actor = apiStaff(reportPermissions());
    $old = apiHeaders($actor, ['properties:read', 'leads:read']);
    $this->getJson('/api/v1/admin/reports/overview', $old)->assertForbidden();
    $login = $this->postJson('/api/v1/auth/login', ['email' => $actor->email, 'password' => 'Password123!', 'device_name' => 'Report test'])->assertCreated();
    $h = ['Authorization' => 'Bearer '.$login->json('data.access_token')];
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonCount(5, 'meta.available_sections');
    $this->postJson('/api/v1/auth/logout', [], $h)->assertNoContent();
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertUnauthorized();
    $this->getJson('/api/v1/admin/reports/overview', $old)->assertForbidden();
});
