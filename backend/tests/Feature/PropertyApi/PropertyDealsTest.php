<?php

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Webkul\Contact\Models\Person;
use Webkul\Property\Models\PropertyDeal;
use Webkul\Property\Models\PropertyDealEvent;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);
function dealPermissions(): array
{
    return ['deals', 'deals.view', 'deals.create', 'deals.confirm', 'deals.cancel', 'properties', 'properties.edit', 'properties.delete', 'leads.view'];
}
function dealPayload($property, $lead, array $changes = []): array
{
    return array_replace(['request_id' => (string) Str::uuid(), 'property_id' => $property->id, 'lead_id' => $lead->id, 'agreed_price' => '6500000.50', 'booking_amount' => '50000.25', 'payment_reference' => 'Offline reference', 'notes' => 'Customer agreed terms'], $changes);
}
function dealBase(): string
{
    return '/api/v1/admin/property-deals';
}

it('reserves inventory with server-owned snapshots and immutable financial metadata', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l, $person] = visitSources($a);
    $h = apiHeaders($a);
    $r = $this->postJson(dealBase(), dealPayload($p, $l, ['user_id' => 999, 'person_id' => 999, 'created_by' => 999, 'currency' => 'USD', 'purpose' => 'rent', 'customer_name' => 'Spoof', 'status' => 'confirmed', 'active_property_id' => null]), $h)->assertCreated()
        ->assertJsonPath('data.status', 'reserved')->assertJsonPath('data.user_id', $a->id)->assertJsonPath('data.created_by', $a->id)
        ->assertJsonPath('data.person_id', $person->id)->assertJsonPath('data.customer_name', 'Visit Customer')
        ->assertJsonPath('data.currency', 'INR')->assertJsonPath('data.purpose', 'sale')->assertJsonPath('data.agreed_price', '6500000.50')
        ->assertJsonPath('data.booking_amount', '50000.25')->assertJsonCount(1, 'data.events')->assertJsonPath('data.events.0.action', 'reserved')
        ->assertJsonMissingPath('data.payload_hash')->assertJsonMissingPath('data.active_property_id');
    expect($p->refresh()->status)->toBe('reserved')->and($l->refresh()->closed_at)->toBeNull();
    expect($r->headers->get('Cache-Control'))->toContain('no-store');
    $this->getJson('/api/v1/properties/'.$p->id)->assertNotFound();
    $this->getJson('/api/v1/admin/properties?status=reserved', $h)->assertOk()->assertJsonPath('data.0.id', $p->id);
    $this->getJson('/api/v1/properties?status=reserved')->assertUnprocessable();
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry(), $h)->assertNotFound();
});

it('replays an identical booking request without creating events or reserving again after cancellation', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $data = dealPayload($p, $l, ['agreed_price' => '00010.1', 'booking_amount' => '0']);
    $id = $this->postJson(dealBase(), $data, $h)->assertCreated()->json('data.id');
    $data['agreed_price'] = '10.10';
    $data['booking_amount'] = '0.00';
    $data['request_id'] = strtoupper($data['request_id']);
    $this->postJson(dealBase(), $data, $h)->assertOk()->assertJsonPath('data.id', $id)->assertJsonCount(1, 'data.events');
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Plans changed'], $h)->assertOk();
    $this->postJson(dealBase(), $data, $h)->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonCount(2, 'data.events');
    expect($p->refresh()->status)->toBe('available')->and(PropertyDeal::count())->toBe(1);
});

it('rejects reused booking keys with changed payloads or another creator', function () {
    $a = apiStaff([], visibility: 'global', all: true);
    [$p, $l] = visitSources($a);
    $data = dealPayload($p, $l);
    $h = apiHeaders($a);
    $this->postJson(dealBase(), $data, $h)->assertCreated();
    $this->postJson(dealBase(), array_replace($data, ['booking_amount' => '1.00']), $h)->assertConflict();
    $other = apiStaff(dealPermissions(), 'global');
    $this->postJson(dealBase(), $data, apiHeaders($other))->assertConflict();
    expect(PropertyDeal::count())->toBe(1)->and(PropertyDealEvent::count())->toBe(1);
});

it('confirms sale and rental deals atomically and preserves the original lead workflow', function ($purpose, $expected) {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $p->update(['purpose' => $purpose, 'rent_period' => $purpose === 'rent' ? 'monthly' : null]);
    $before = $l->only(['title', 'lead_pipeline_stage_id', 'status', 'closed_at', 'person_id']);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $r = $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertOk()->assertJsonPath('data.status', 'confirmed')->assertJsonCount(2, 'data.events');
    $stamp = $r->json('data.confirmed_at');
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertOk()->assertJsonPath('data.confirmed_at', $stamp)->assertJsonCount(2, 'data.events');
    expect($p->refresh()->status)->toBe($expected)->and($l->refresh()->only(array_keys($before)))->toBe($before);
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Undo confirmed deal'], $h)->assertUnprocessable();
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertUnprocessable();
})->with([['sale', 'sold'], ['rent', 'rented']]);

it('cancels only the reservation and preserves advance records with an idempotent terminal retry', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $this->patchJson(dealBase().'/'.$id.'/cancel', [], $h)->assertUnprocessable()->assertJsonValidationErrors('cancellation_reason');
    $r = $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Customer withdrew'], $h)->assertOk()->assertJsonPath('data.booking_amount', '50000.25')->assertJsonPath('data.status', 'cancelled');
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Different retry reason'], $h)->assertOk()->assertJsonPath('data.cancelled_at', $r->json('data.cancelled_at'))->assertJsonPath('data.cancellation_reason', 'Customer withdrew')->assertJsonCount(2, 'data.events');
    expect($p->refresh()->status)->toBe('available')->and($p->is_published)->toBeTrue()->and(PropertyDeal::findOrFail($id)->active_property_id)->toBeNull();
    $this->getJson('/api/v1/properties/'.$p->id)->assertOk();
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertUnprocessable();
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated();
});

it('prevents duplicate commitments even if a property is externally reset to available', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated();
    $p->update(['status' => 'available']);
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertUnprocessable()->assertJsonValidationErrors('property_id');
    $existing = PropertyDeal::sole();
    $duplicate = $existing->replicate();
    $duplicate->request_id = (string) Str::uuid();
    expect(fn () => $duplicate->save())->toThrow(QueryException::class);
    expect(PropertyDeal::count())->toBe(1);
});

it('guards ordinary property edits and deletion while a deal controls inventory', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['status' => 'available']), $h)->assertUnprocessable();
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['status' => 'reserved', 'purpose' => 'rent', 'rent_period' => 'monthly']), $h)->assertUnprocessable();
    $this->deleteJson('/api/v1/admin/properties/'.$p->id, [], $h)->assertUnprocessable();
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['status' => 'reserved', 'description' => 'Updated listing details']), $h)->assertOk();
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertOk();
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['status' => 'available']), $h)->assertUnprocessable();
    $creator = apiStaff([], all: true);
    $this->postJson('/api/v1/admin/properties', apiPropertyPayload(['status' => 'reserved']), apiHeaders($creator))->assertUnprocessable();
});

it('does not override unrelated externally changed inventory on cancellation', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $p->update(['status' => 'unavailable']);
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'External withdrawal'], $h)->assertOk();
    expect($p->refresh()->status)->toBe('unavailable');
});

it('requires authentication deal action and read permissions plus source rights and token abilities', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $data = dealPayload($p, $l);
    $h = apiHeaders($a);
    $this->getJson(dealBase())->assertUnauthorized();
    $this->postJson(dealBase(), $data)->assertUnauthorized();
    foreach ([['deals.create'], ['deals.view'], ['deals.create', 'deals.view', 'properties', 'leads.view']] as $perms) {
        $a->role->update(['permissions' => $perms]);
        $this->postJson(dealBase(), $data, $h)->assertForbidden();
    }
    $a->role->update(['permissions' => dealPermissions()]);
    foreach ([['deals:read'], ['deals:write'], ['deals:write', 'properties:read', 'properties:write']] as $abilities) {
        $this->postJson(dealBase(), $data, apiHeaders($a, $abilities))->assertForbidden();
    }
    $id = $this->postJson(dealBase(), $data, $h)->assertCreated()->json('data.id');
    foreach (['confirm', 'cancel'] as $action) {
        $a->role->update(['permissions' => ['deals.view', 'properties', 'properties.edit', 'leads.view']]);
        $this->patchJson(dealBase().'/'.$id.'/'.$action, ['cancellation_reason' => 'Test'], $h)->assertForbidden();
        $a->role->update(['permissions' => dealPermissions()]);
        $this->patchJson(dealBase().'/'.$id.'/'.$action, ['cancellation_reason' => 'Test'], apiHeaders($a, ['deals:read']))->assertForbidden();
    }
    $this->getJson(dealBase(), apiHeaders($a, ['properties:read']))->assertForbidden();
    $a->role->update(['permissions' => ['deals']]);
    $this->getJson(dealBase().'/'.$id, $h)->assertForbidden();
});

it('enforces own group empty-group and global scopes even for full-permission roles', function () {
    $a = apiStaff([], all: true);
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $outside = apiStaff([], all: true);
    $oh = apiHeaders($outside);
    $this->getJson(dealBase(), $oh)->assertOk()->assertJsonCount(0, 'data');
    $this->getJson(dealBase().'/'.$id, $oh)->assertNotFound();
    foreach (['confirm', 'cancel'] as $action) {
        $this->patchJson(dealBase().'/'.$id.'/'.$action, ['cancellation_reason' => 'Test'], $oh)->assertNotFound();
    }
    $group = apiStaff(dealPermissions(), 'group');
    $gh = apiHeaders($group);
    $this->getJson(dealBase(), $gh)->assertOk()->assertJsonCount(0, 'data');
    $g = Group::create(['name' => 'Deal team']);
    $g->users()->attach([$a->id, $group->id]);
    $this->getJson(dealBase(), $gh)->assertOk()->assertJsonCount(1, 'data');
    $this->getJson(dealBase().'/'.$id, $gh)->assertOk();
    $group->update(['view_permission' => 'global']);
    $this->getJson(dealBase().'/'.$id, $gh)->assertOk();
});

it('requires both source records to be visible and current source rights on confirmation', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $outside = apiStaff(dealPermissions());
    $this->postJson(dealBase(), dealPayload($p, $l), apiHeaders($outside))->assertNotFound();
    [$op, $ol] = visitSources($outside);
    $this->postJson(dealBase(), dealPayload($p, $ol), apiHeaders($a))->assertNotFound();
    $id = $this->postJson(dealBase(), dealPayload($p, $l), apiHeaders($a))->assertCreated()->json('data.id');
    $l->update(['user_id' => $outside->id]);
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], apiHeaders($a))->assertNotFound();
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Reassigned lead'], apiHeaders($a))->assertOk();
});

it('rejects unavailable properties closed leads and missing customers before reserving', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $p->update(['status' => 'sold']);
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertUnprocessable();
    $p->update(['status' => 'available']);
    $l->update(['closed_at' => now()]);
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertUnprocessable();
    $l->update(['closed_at' => null, 'person_id' => null]);
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertUnprocessable();
    expect(PropertyDeal::count())->toBe(0)->and($p->refresh()->status)->toBe('available');
});

it('rejects changed customers and rental periods on confirmation but permits cancellation', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $p->update(['purpose' => 'rent', 'rent_period' => 'monthly']);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['status' => 'reserved', 'purpose' => 'rent', 'rent_period' => 'yearly']), $h)->assertUnprocessable();
    $p->update(['rent_period' => 'yearly']);
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertUnprocessable();
    $p->update(['rent_period' => 'monthly']);
    $other = Person::create(['name' => 'Different buyer', 'emails' => [], 'contact_numbers' => [], 'user_id' => $a->id]);
    $l->update(['person_id' => $other->id]);
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertUnprocessable();
    $this->getJson(dealBase().'/'.$id, $h)->assertOk()->assertJsonPath('data.customer_name', 'Visit Customer');
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Contact changed'], $h)->assertOk();
});

it('rolls back property and deal changes when audit insertion fails', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $fail = true;
    Event::listen('eloquent.creating: '.PropertyDealEvent::class, function () use (&$fail) {
        if ($fail) {
            throw new RuntimeException('Audit unavailable');
        }
    });
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertStatus(500);
    expect(PropertyDeal::count())->toBe(0)->and($p->refresh()->status)->toBe('available');
    $fail = false;
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $fail = true;
    foreach (['confirm', 'cancel'] as $action) {
        $this->patchJson(dealBase().'/'.$id.'/'.$action, ['cancellation_reason' => 'Cancel'], $h)->assertStatus(500);
        expect(PropertyDeal::findOrFail($id)->status)->toBe('reserved')->and($p->refresh()->status)->toBe('reserved');
    }
    expect(PropertyDealEvent::count())->toBe(1);
});

it('preserves financial history and snapshots after confirmed sources are deleted', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l, $person] = visitSources($a);
    $h = apiHeaders($a);
    $data = dealPayload($p, $l);
    $id = $this->postJson(dealBase(), $data, $h)->assertCreated()->json('data.id');
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertOk();
    $this->deleteJson('/api/v1/admin/properties/'.$p->id, [], $h)->assertNoContent();
    $l->delete();
    $person->delete();
    $this->getJson(dealBase().'/'.$id, $h)->assertOk()->assertJsonPath('data.property_id', null)->assertJsonPath('data.lead_id', null)->assertJsonPath('data.customer_name', 'Visit Customer')->assertJsonPath('data.agreed_price', '6500000.50')->assertJsonCount(2, 'data.events');
    $this->postJson(dealBase(), $data, $h)->assertOk()->assertJsonPath('data.id', $id);
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertOk()->assertJsonCount(2, 'data.events');
});

it('lists paginated summaries without detail-only customer payment notes or audit fields', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated();
    $r = $this->getJson(dealBase().'?status=reserved&property_id='.$p->id.'&lead_id='.$l->id.'&user_id='.$a->id.'&purpose=sale&per_page=1', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 1)->assertJsonMissingPath('data.0.customer_name')->assertJsonMissingPath('data.0.payment_reference')->assertJsonMissingPath('data.0.notes')->assertJsonMissingPath('data.0.events');
    expect($r->headers->get('Cache-Control'))->toContain('no-store');
    $this->getJson(dealBase().'?from=2090-01-01T00:00:00Z', $h)->assertOk()->assertJsonCount(0, 'data');
    foreach (['per_page=101', 'status=sold', 'from=2026-11-01%2010:00:00', 'from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z'] as $filter) {
        $this->getJson(dealBase().'?'.$filter, $h)->assertUnprocessable();
    }
    $this->getJson('/api/v1/property-deals')->assertNotFound();
});

it('validates booking ids exact money and metadata limits before writes', function ($changes, $field) {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $this->postJson(dealBase(), dealPayload($p, $l, $changes), apiHeaders($a))->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(PropertyDeal::count())->toBe(0)->and($p->refresh()->status)->toBe('available');
})->with([
    [['request_id' => 'invalid'], 'request_id'], [['property_id' => 0], 'property_id'], [['lead_id' => 'x'], 'lead_id'],
    [['agreed_price' => '0.00'], 'agreed_price'], [['agreed_price' => '-1'], 'agreed_price'], [['agreed_price' => '1e3'], 'agreed_price'],
    [['agreed_price' => '1.001'], 'agreed_price'], [['agreed_price' => '10000000000000'], 'agreed_price'], [['agreed_price' => 125.50], 'agreed_price'],
    [['booking_amount' => '-1'], 'booking_amount'], [['booking_amount' => '6500000.51'], 'booking_amount'],
    [['payment_reference' => str_repeat('a', 191)], 'payment_reference'], [['notes' => str_repeat('a', 5001)], 'notes'],
]);

it('issues deal abilities on fresh login and denies inactive or revoked clients', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $this->getJson(dealBase(), apiHeaders($a, ['properties:read']))->assertForbidden();
    $login = $this->postJson('/api/v1/auth/login', ['email' => $a->email, 'password' => 'Password123!', 'device_name' => 'Deals test'])->assertCreated();
    $h = ['Authorization' => 'Bearer '.$login->json('data.access_token')];
    $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated();
    $a->update(['status' => 0]);
    $this->getJson(dealBase(), $h)->assertForbidden();
    $a->update(['status' => 1]);
    $this->postJson('/api/v1/auth/logout', [], $h)->assertNoContent();
    $this->getJson(dealBase(), $h)->assertUnauthorized();
});

it('reflects reservation and release in dashboard inventory totals', function () {
    $a = apiStaff(array_merge(dealPermissions(), ['property-reports']));
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.properties.total', 1)->assertJsonPath('data.properties.reserved', 1)->assertJsonPath('data.properties.available', 0);
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Release'], $h)->assertOk();
    $this->getJson('/api/v1/admin/reports/overview', $h)->assertOk()->assertJsonPath('data.properties.reserved', 0)->assertJsonPath('data.properties.available', 1);
});

it('can cancel after customer sources disappear and lead read permission is removed', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l, $person] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $l->delete();
    $person->delete();
    $a->role->update(['permissions' => array_values(array_diff(dealPermissions(), ['leads.view']))]);
    $h = apiHeaders($a, ['deals:write', 'properties:read', 'properties:write']);
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertForbidden();
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Customer record removed'], $h)->assertOk()->assertJsonPath('data.customer_name', 'Visit Customer');
    expect($p->refresh()->status)->toBe('available');
});

it('retains deal ownership while requiring current property visibility for actual mutations', function () {
    $a = apiStaff(dealPermissions());
    [$p, $l] = visitSources($a);
    $h = apiHeaders($a);
    $id = $this->postJson(dealBase(), dealPayload($p, $l), $h)->assertCreated()->json('data.id');
    $other = apiStaff(dealPermissions());
    $p->update(['user_id' => $other->id]);
    $this->getJson(dealBase().'/'.$id, $h)->assertOk()->assertJsonPath('data.user_id', $a->id);
    $this->patchJson(dealBase().'/'.$id.'/confirm', [], $h)->assertNotFound();
    $this->patchJson(dealBase().'/'.$id.'/cancel', ['cancellation_reason' => 'Transfer'], $h)->assertNotFound();
    $this->getJson(dealBase().'/'.$id, apiHeaders($other))->assertNotFound();
    expect($p->refresh()->status)->toBe('reserved');
});
