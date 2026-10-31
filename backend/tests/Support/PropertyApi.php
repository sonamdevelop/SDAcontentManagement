<?php

use Illuminate\Support\Str;
use Webkul\Contact\Models\Person;
use Webkul\Lead\Models\Lead;
use Webkul\Property\Models\Property;
use Webkul\User\Models\Role;
use Webkul\User\Models\User;

function apiStaff(array $permissions = [], string $visibility = 'own', bool $all = false): User
{
    $role = Role::create(['name' => 'API role '.Str::uuid(), 'permission_type' => $all ? 'all' : 'custom', 'permissions' => $permissions]);

    return User::create(['name' => 'API Staff', 'email' => Str::uuid().'@example.com', 'password' => bcrypt('Password123!'), 'status' => 1, 'role_id' => $role->id, 'view_permission' => $visibility]);
}
function apiHeaders(User $user, array $abilities = ['properties:read', 'properties:write', 'enquiries:read', 'leads:read', 'leads:write', 'visits:read', 'visits:write']): array
{
    return ['Authorization' => 'Bearer '.$user->createToken('tests', $abilities, now()->addHour())->plainTextToken];
}
function apiPropertyPayload(array $changes = []): array
{
    return array_replace([
        'title' => 'River view apartment', 'purpose' => 'sale', 'property_type' => 'apartment', 'price' => '6500000.50', 'area' => '1200', 'area_unit' => 'sqft',
        'bedrooms' => 2, 'bathrooms' => 2, 'address' => 'Private street 12', 'city' => 'Dandeli', 'state' => 'Karnataka', 'owner_name' => 'Private Owner', 'owner_phone' => '9000011111', 'status' => 'available',
    ], $changes);
}
function apiProperty(User $owner, array $changes = []): Property
{
    return Property::create(apiPropertyPayload(array_replace(['user_id' => $owner->id, 'is_published' => true, 'accepts_enquiries' => true], $changes)));
}
function apiEnquiry(array $changes = []): array
{
    return array_replace(['submission_id' => (string) Str::uuid(), 'name' => 'Asha Rao', 'email' => ' ASHA@EXAMPLE.COM ', 'phone' => '+91 9000000000', 'message' => 'Please arrange a site visit.', 'consent' => true], $changes);
}

function visitSources($owner): array
{
    $property = apiProperty($owner);
    $pipeline = securityTestPipeline();
    $person = Person::create(['name' => 'Visit Customer', 'user_id' => $owner->id, 'emails' => [['value' => Str::uuid().'@example.com', 'label' => 'work']], 'contact_numbers' => [['value' => '+91 9000000000', 'label' => 'work']]]);
    $lead = Lead::create(['title' => 'Visit lead', 'user_id' => $owner->id, 'person_id' => $person->id, 'lead_pipeline_id' => $pipeline->id, 'lead_pipeline_stage_id' => $pipeline->stages()->first()->id]);

    return [$property, $lead, $person];
}
function visitPayload($property, $lead, $agent, array $changes = []): array
{
    $start = now()->addDay()->startOfHour()->addHours(2);

    return array_replace(['property_id' => $property->id, 'lead_id' => $lead->id, 'user_id' => $agent->id, 'starts_at' => $start->format('Y-m-d\TH:i:sP'), 'ends_at' => $start->copy()->addHour()->format('Y-m-d\TH:i:sP'), 'notes' => 'Meet at reception'], $changes);
}
