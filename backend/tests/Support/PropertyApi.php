<?php

use Illuminate\Support\Str;
use Webkul\Property\Models\Property;
use Webkul\User\Models\Role;
use Webkul\User\Models\User;

function apiStaff(array $permissions = [], string $visibility = 'own', bool $all = false): User
{
    $role = Role::create(['name' => 'API role '.Str::uuid(), 'permission_type' => $all ? 'all' : 'custom', 'permissions' => $permissions]);

    return User::create(['name' => 'API Staff', 'email' => Str::uuid().'@example.com', 'password' => bcrypt('Password123!'), 'status' => 1, 'role_id' => $role->id, 'view_permission' => $visibility]);
}
function apiHeaders(User $user, array $abilities = ['properties:read', 'properties:write', 'enquiries:read']): array
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
