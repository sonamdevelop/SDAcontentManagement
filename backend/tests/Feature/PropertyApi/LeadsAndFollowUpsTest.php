<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Webkul\Activity\Models\Activity;
use Webkul\Lead\Models\Lead;
use Webkul\Lead\Models\Pipeline;
use Webkul\Lead\Models\Product as LeadProduct;
use Webkul\Product\Models\Product;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);

function workflowLead($owner, array $changes = []): Lead
{
    $pipeline = securityTestPipeline();

    return Lead::create(array_replace(['title' => 'Workflow lead', 'description' => 'Private customer requirement', 'user_id' => $owner->id, 'lead_pipeline_id' => $pipeline->id, 'lead_pipeline_stage_id' => $pipeline->stages()->first()->id, 'lead_value' => 500, 'expected_close_date' => '2027-01-15'], $changes));
}
function workflowStage($lead, string $code)
{
    return $lead->pipeline->stages()->firstOrCreate(['code' => $code], ['name' => ucfirst($code), 'sort_order' => 5, 'probability' => $code === 'won' ? 100 : 0]);
}
function workflowTask(array $changes = []): array
{
    return array_replace(['type' => 'task', 'title' => 'Call buyer', 'comment' => 'Discuss the property', 'due_at' => now()->addDay()->format('Y-m-d\TH:i:sP')], $changes);
}

it('lists scoped lead summaries without leaking detail-only customer fields', function () {
    $actor = apiStaff(['leads', 'leads.view']);
    $other = apiStaff();
    $own = workflowLead($actor);
    workflowLead($other, ['title' => 'Other private lead']);
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/leads', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own->id)->assertJsonMissingPath('data.0.description')->assertJsonMissingPath('data.0.contact');
    $this->getJson('/api/v1/admin/leads/'.$own->id, $h)->assertOk()->assertJsonPath('data.description', 'Private customer requirement');
    $listOnly = apiStaff(['leads']);
    $lead = workflowLead($listOnly);
    $this->getJson('/api/v1/admin/leads/'.$lead->id, apiHeaders($listOnly))->assertForbidden();
});
it('rejects unauthenticated and out-of-scope lead operations', function () {
    $actor = apiStaff(['leads', 'leads.view', 'leads.edit', 'leads.assign']);
    $lead = workflowLead(apiStaff());
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/leads')->assertUnauthorized();
    $this->getJson('/api/v1/admin/leads/'.$lead->id, $h)->assertNotFound();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $lead->lead_pipeline_stage_id], $h)->assertNotFound();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/assignment', ['user_id' => $actor->id], $h)->assertNotFound();
    $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', workflowTask(), $h)->assertNotFound();
});
it('keeps group scopes bounded including an empty group', function () {
    $actor = apiStaff(['leads', 'leads.view', 'leads.assign'], 'group');
    $mate = apiStaff(['leads', 'leads.view']);
    $outsider = apiStaff(['leads.view']);
    $own = workflowLead($actor);
    $team = workflowLead($mate);
    workflowLead($outsider, ['title' => 'Outsider lead']);
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/leads', $h)->assertOk()->assertJsonCount(0, 'data');
    $group = Group::create(['name' => 'API group']);
    $group->users()->attach([$actor->id, $mate->id]);
    $this->getJson('/api/v1/admin/leads', $h)->assertOk()->assertJsonCount(2, 'data');
    $this->getJson('/api/v1/admin/leads/'.$team->id, $h)->assertOk();
    $this->patchJson('/api/v1/admin/leads/'.$own->id.'/assignment', ['user_id' => $outsider->id], $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/leads/'.$own->id.'/assignment', ['user_id' => $mate->id], $h)->assertOk()->assertJsonPath('data.user_id', $mate->id);
});
it('filters and paginates leads and returns pipeline metadata', function () {
    $actor = apiStaff([], visibility: 'global', all: true);
    $a = workflowLead($actor);
    workflowLead($actor, ['title' => 'Second lead']);
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/leads?q=Workflow&per_page=1&lead_pipeline_id='.$a->lead_pipeline_id, $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/admin/leads?per_page=101', $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/lead-pipelines', $h)->assertOk()->assertJsonStructure(['data' => [['id', 'name', 'stages']]]);
});
it('assigns only eligible active agents and transfers exclusive task ownership', function () {
    $manager = apiStaff([], visibility: 'global', all: true);
    $target = apiStaff(['leads.view']);
    $inactive = apiStaff(['leads.view']);
    $inactive->update(['status' => 0]);
    $ineligible = apiStaff(['properties']);
    $lead = workflowLead($manager);
    $h = apiHeaders($manager);
    $task = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', workflowTask(), $h)->assertCreated()->json('data.id');
    $response = $this->getJson('/api/v1/admin/lead-assignees', $h)->assertOk();
    $ids = array_column($response->json('data'), 'id');
    expect($ids)->toContain($target->id)->not->toContain($inactive->id)->not->toContain($ineligible->id);
    foreach ([$inactive->id, $ineligible->id, 4294967294] as $id) {
        $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/assignment', ['user_id' => $id], $h)->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/assignment', ['user_id' => $target->id, 'role_id' => 9999, 'view_permission' => 'global'], $h)->assertOk()->assertJsonPath('data.user_id', $target->id);
    expect(Activity::find($task)->user_id)->toBe($target->id)->and($target->fresh()->view_permission)->toBe('own');
});
it('enforces assignment action and read permissions and token write abilities', function () {
    $actor = apiStaff(['leads.view', 'leads.edit']);
    $lead = workflowLead($actor);
    $h = apiHeaders($actor);
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/assignment', ['user_id' => $actor->id], $h)->assertForbidden();
    $noView = apiStaff(['leads.assign', 'leads.edit']);
    $lead2 = workflowLead($noView);
    $this->patchJson('/api/v1/admin/leads/'.$lead2->id.'/assignment', ['user_id' => $noView->id], apiHeaders($noView))->assertForbidden();
    $this->postJson('/api/v1/admin/leads/'.$lead2->id.'/follow-ups', workflowTask(), apiHeaders($noView))->assertForbidden();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $lead->lead_pipeline_stage_id], apiHeaders($actor, ['leads:read']))->assertForbidden();
    $this->getJson('/api/v1/admin/leads/'.$lead->id, apiHeaders($actor, ['properties:read']))->assertForbidden();
});
it('preserves lead products expected close dates and customer identity across stage and assignment updates', function () {
    $actor = apiStaff([], visibility: 'global', all: true);
    $target = apiStaff(['leads.view']);
    $lead = workflowLead($actor);
    $h = apiHeaders($actor);
    $product = Product::create(['sku' => 'workflow-'.uniqid(), 'name' => 'Property package', 'price' => 100, 'quantity' => 1]);
    $line = LeadProduct::create(['lead_id' => $lead->id, 'product_id' => $product->id, 'quantity' => 2, 'price' => 100, 'amount' => 200]);
    $stage = workflowStage($lead, 'negotiation');
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $stage->id, 'person_id' => 9999, 'lead_value' => 9999], $h)->assertOk();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/assignment', ['user_id' => $target->id], $h)->assertOk();
    expect($lead->fresh()->expected_close_date->format('Y-m-d'))->toBe('2027-01-15')->and((float) $lead->fresh()->lead_value)->toBe(500.0)->and($lead->fresh()->person_id)->toBeNull();
    $this->assertDatabaseHas('lead_products', ['id' => $line->id, 'quantity' => 2, 'amount' => 200]);
});
it('enforces stage pipeline consistency and lost reasons and supports reopening', function () {
    $actor = apiStaff([], all: true);
    $lead = workflowLead($actor);
    $h = apiHeaders($actor);
    $lost = workflowStage($lead, 'lost');
    $won = workflowStage($lead, 'won');
    $open = workflowStage($lead, 'new');
    $other = Pipeline::create(['name' => 'Other pipeline', 'is_default' => 0, 'rotten_days' => 30]);
    $alien = $other->stages()->create(['name' => 'Alien', 'code' => 'new', 'sort_order' => 1, 'probability' => 100]);
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $alien->id], $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $lost->id], $h)->assertUnprocessable()->assertJsonValidationErrors('lost_reason');
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $lost->id, 'lost_reason' => 'Budget mismatch'], $h)->assertOk()->assertJsonPath('data.lost_reason', 'Budget mismatch');
    $closed = $lead->fresh()->closed_at->toDateTimeString();
    $this->travel(10)->minutes();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $lost->id], $h)->assertOk();
    expect($lead->fresh()->closed_at->toDateTimeString())->toBe($closed);
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $won->id], $h)->assertOk()->assertJsonPath('data.lost_reason', null);
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/stage', ['lead_pipeline_stage_id' => $open->id], $h)->assertOk()->assertJsonPath('data.closed_at', null)->assertJsonPath('data.lost_reason', null);
});
it('creates safe plain-text notes and timezone-aware tasks in the native CRM activity relation', function () {
    $actor = apiStaff([], all: true);
    $lead = workflowLead($actor);
    $h = apiHeaders($actor);
    $note = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', ['type' => 'note', 'comment' => 'Buyer budget < 70 lakh', 'user_id' => 9999, 'participants' => ['users' => [9999]], 'is_done' => false], $h)->assertCreated()->assertJsonPath('data.type', 'note')->assertJsonPath('data.comment', 'Buyer budget < 70 lakh')->assertJsonPath('data.is_done', true)->json('data.id');
    expect(Activity::find($note)->comment)->toContain('&lt;')->and(Activity::find($note)->participants()->count())->toBe(0);
    $task = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', workflowTask(['due_at' => '2026-11-02T10:30:00Z']), $h)->assertCreated()->assertJsonPath('data.is_done', false)->json('data.id');
    expect(Activity::find($task)->schedule_to->utc()->format('Y-m-d H:i:s'))->toBe('2026-11-02 10:30:00');
    $this->assertDatabaseHas('lead_activities', ['lead_id' => $lead->id, 'activity_id' => $task]);
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$task, ['is_done' => true, 'user_id' => 9999], $h)->assertOk()->assertJsonPath('data.status', 'done');
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$task, ['is_done' => false], $h)->assertOk()->assertJsonPath('data.status', 'pending');
    $this->deleteJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$note, [], $h)->assertNoContent();
    $this->assertDatabaseMissing('activities', ['id' => $note]);
});
it('validates note and task payloads before writing', function ($changes, $field) {
    $actor = apiStaff([], all: true);
    $lead = workflowLead($actor);
    $before = Activity::count();
    $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', $changes, apiHeaders($actor))->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(Activity::count())->toBe($before);
})->with([
    [['type' => 'note'], 'comment'], [['type' => 'task', 'title' => 'Call'], 'due_at'], [['type' => 'task', 'due_at' => '2026-11-01T10:00:00Z'], 'title'],
    [['type' => 'email', 'comment' => 'x'], 'type'], [['type' => 'note', 'comment' => ['bad']], 'comment'], [['type' => 'note', 'comment' => str_repeat('a', 10001)], 'comment'],
    [['type' => 'note', 'comment' => '{{constructor}}'], 'comment'], [['type' => 'task', 'title' => 'Call', 'due_at' => '2026-11-01 10:00:00'], 'due_at'],
    [['type' => 'task', 'title' => 'Call', 'due_at' => '2026-02-30T10:00:00Z'], 'due_at'],
]);
it('filters pending done and overdue tasks without leaking other leads', function () {
    $this->travelTo(now()->startOfMinute());
    $actor = apiStaff([], all: true);
    $other = apiStaff();
    $lead = workflowLead($actor);
    $foreign = workflowLead($other);
    $h = apiHeaders($actor);
    foreach ([['title' => 'Overdue', 'due_at' => now()->subHour()->format('Y-m-d\TH:i:sP')], ['title' => 'Future', 'due_at' => now()->addHour()->format('Y-m-d\TH:i:sP')], ['title' => 'Done', 'is_done' => true, 'due_at' => now()->subHour()->format('Y-m-d\TH:i:sP')]] as $changes) {
        $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', workflowTask($changes), $h)->assertCreated();
    }
    $this->postJson('/api/v1/admin/leads/'.$foreign->id.'/follow-ups', workflowTask(['title' => 'Other lead task']), apiHeaders(apiStaff([], visibility: 'global', all: true)))->assertCreated();
    $this->getJson('/api/v1/admin/follow-ups?overdue=1', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Overdue')->assertJsonPath('data.0.is_overdue', true);
    $this->getJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups?status=done', $h)->assertOk()->assertJsonCount(1, 'data');
    $this->getJson('/api/v1/admin/follow-ups?status=pending&per_page=1', $h)->assertOk()->assertJsonPath('meta.total', 2);
});
it('blocks cross-lead ids system activities shared mutations and unsafe note ownership', function () {
    $actor = apiStaff([], all: true);
    $lead = workflowLead($actor);
    $other = workflowLead(apiStaff());
    $h = apiHeaders($actor);
    $task = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', workflowTask(), $h)->assertCreated()->json('data.id');
    $this->patchJson('/api/v1/admin/leads/'.$other->id.'/follow-ups/'.$task, ['is_done' => true], $h)->assertNotFound();
    $system = $lead->activities()->where('type', 'system')->first();
    $this->deleteJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$system->id, [], $h)->assertNotFound();
    $other->activities()->attach($task);
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$task, ['is_done' => true], $h)->assertNotFound();
    $this->deleteJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$task, [], $h)->assertNotFound();
    $this->getJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', $h)->assertJsonPath('data.0.lead_ids', [$lead->id]);
});
it('rejects follow-up type mutation and keeps notes completed', function () {
    $actor = apiStaff([], all: true);
    $lead = workflowLead($actor);
    $h = apiHeaders($actor);
    $note = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', ['type' => 'note', 'comment' => 'Note'], $h)->json('data.id');
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$note, ['type' => 'task'], $h)->assertUnprocessable();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$note, ['is_done' => false], $h)->assertOk()->assertJsonPath('data.is_done', true);
});

it('issues new lead abilities only on new login tokens', function () {
    $actor = apiStaff([], all: true);
    $lead = workflowLead($actor);
    $old = apiHeaders($actor, ['properties:read', 'properties:write', 'enquiries:read']);
    $this->getJson('/api/v1/admin/leads/'.$lead->id, $old)->assertForbidden();
    $login = $this->postJson('/api/v1/auth/login', ['email' => $actor->email, 'password' => 'Password123!', 'device_name' => 'Lead client'])->assertCreated();
    $new = ['Authorization' => 'Bearer '.$login->json('data.access_token')];
    $this->getJson('/api/v1/admin/leads/'.$lead->id, $new)->assertOk();
    $this->getJson('/api/v1/admin/leads/'.$lead->id, $old)->assertForbidden();
});

it('protects notes by author scope and keeps transferred tasks manageable by the new lead owner', function () {
    $manager = apiStaff([], visibility: 'global', all: true);
    $owner = apiStaff(['leads.view', 'leads.edit']);
    $target = apiStaff(['leads.view', 'leads.edit']);
    $lead = workflowLead($owner);
    $h = apiHeaders($manager);
    $note = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', ['type' => 'note', 'comment' => 'Manager note'], $h)->assertCreated()->json('data.id');
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$note, ['comment' => 'Changed by another author'], apiHeaders($owner))->assertNotFound();
    $task = $this->postJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', workflowTask(), apiHeaders($owner))->assertCreated()->json('data.id');
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/assignment', ['user_id' => $target->id], $h)->assertOk();
    $this->patchJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups/'.$task, ['is_done' => true], apiHeaders($target))->assertOk();
    $this->getJson('/api/v1/admin/leads/'.$lead->id.'/follow-ups', apiHeaders($owner))->assertNotFound();
});

it('validates follow-up filter ranges and timezone requirements', function () {
    $actor = apiStaff(['leads.view']);
    $h = apiHeaders($actor);
    $this->getJson('/api/v1/admin/follow-ups?due_after=2026-11-01%2010:00:00', $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/follow-ups?due_after=2026-11-02T10:00:00Z&due_before=2026-11-01T10:00:00Z', $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/follow-ups?status=unknown', $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/follow-ups?per_page=1000', $h)->assertUnprocessable();
});
