<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Models\Property;

uses(DatabaseTransactions::class);
beforeEach(function () {
    Storage::fake('public');
});
it('shows only available published properties from active agents and excludes private fields', function () {
    $owner = apiStaff([], all: true);
    $visible = apiProperty($owner);
    apiProperty($owner, ['title' => 'Unpublished', 'is_published' => false]);
    apiProperty($owner, ['title' => 'Sold', 'status' => 'sold']);
    $disabled = apiStaff();
    $disabled->update(['status' => 0]);
    apiProperty($disabled, ['title' => 'Disabled agent']);
    $this->getJson('/api/v1/properties')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $visible->id)->assertJsonMissingPath('data.0.owner_phone')->assertJsonMissingPath('data.0.owner_name')->assertJsonMissingPath('data.0.address')->assertJsonMissingPath('data.0.user_id')->assertJsonMissingPath('data.0.image_paths')->assertJsonStructure(['links', 'meta']);
    $this->getJson('/api/v1/properties/'.$visible->id)->assertOk()->assertJsonPath('data.price', '6500000.50');
    $this->getJson('/api/v1/properties/4294967294')->assertNotFound();
});
it('does not expose unpublished or unavailable records through the detail endpoint', function () {
    $owner = apiStaff();
    foreach ([['is_published' => false], ['status' => 'sold'], ['status' => 'unavailable']] as $changes) {
        $p = apiProperty($owner, $changes);
        $this->getJson('/api/v1/properties/'.$p->id)->assertNotFound();
    }
});
it('filters paginates and caps public catalogue requests', function () {
    $owner = apiStaff();
    apiProperty($owner, ['city' => 'Delhi', 'price' => 100]);
    apiProperty($owner, ['city' => 'Dandeli', 'price' => 500]);
    apiProperty($owner, ['city' => 'Dandeli', 'price' => 900]);
    $this->getJson('/api/v1/properties?city=Dandeli&min_price=300&max_price=1000&per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('meta.last_page', 2);
    $this->getJson('/api/v1/properties?max_price=200')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson('/api/v1/properties?min_price=500&max_price=100')->assertUnprocessable();
    $this->getJson('/api/v1/properties?per_page=10000')->assertUnprocessable();
    $this->getJson('/api/v1/properties?status=sold')->assertUnprocessable();
});
it('creates a private draft with server-owned assignment and supports full updates and deletion', function () {
    $user = apiStaff([], all: true);
    $headers = apiHeaders($user);
    $response = $this->postJson('/api/v1/admin/properties', apiPropertyPayload(['user_id' => 9999, 'images' => ['other.jpg']]), $headers)->assertCreated()->assertJsonPath('data.user_id', $user->id)->assertJsonPath('data.is_published', false)->assertJsonPath('data.image_paths', []);
    $id = $response->json('data.id');
    $this->getJson('/api/v1/properties/'.$id)->assertNotFound();
    $this->putJson('/api/v1/admin/properties/'.$id, apiPropertyPayload(['purpose' => 'rent', 'rent_period' => 'monthly', 'price' => '28000', 'is_published' => true]), $headers)->assertOk()->assertJsonPath('data.rent_period', 'monthly');
    $this->getJson('/api/v1/properties/'.$id)->assertOk();
    $this->putJson('/api/v1/admin/properties/'.$id, apiPropertyPayload(['rent_period' => 'monthly']), $headers)->assertOk()->assertJsonPath('data.rent_period', null);
    $this->deleteJson('/api/v1/admin/properties/'.$id, [], $headers)->assertNoContent();
    $this->getJson('/api/v1/admin/properties/'.$id, $headers)->assertNotFound();
});
it('enforces action permissions and token abilities separately', function () {
    $user = apiStaff(['properties']);
    $p = apiProperty($user);
    $headers = apiHeaders($user);
    $this->getJson('/api/v1/admin/properties', $headers)->assertOk();
    $this->postJson('/api/v1/admin/properties', apiPropertyPayload(), $headers)->assertForbidden();
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(), $headers)->assertForbidden();
    $this->deleteJson('/api/v1/admin/properties/'.$p->id, [], $headers)->assertForbidden();
    $all = apiStaff([], all: true);
    $readOnly = apiHeaders($all, ['properties:read']);
    $this->postJson('/api/v1/admin/properties', apiPropertyPayload(), $readOnly)->assertForbidden();
    $this->getJson('/api/v1/admin/enquiries', $readOnly)->assertForbidden();
});
it('scopes lists and direct record access to the agent', function () {
    $owner = apiStaff([], all: true);
    $other = apiStaff(['properties', 'properties.edit', 'properties.delete']);
    $p = apiProperty($owner);
    $headers = apiHeaders($other);
    $this->getJson('/api/v1/admin/properties', $headers)->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/admin/properties/'.$p->id, $headers)->assertNotFound();
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['title' => 'Stolen']), $headers)->assertNotFound();
    $this->deleteJson('/api/v1/admin/properties/'.$p->id, [], $headers)->assertNotFound();
    expect($p->fresh()->title)->toBe('River view apartment');
});
it('validates property data before any writes', function ($changes, $field) {
    $this->postJson('/api/v1/admin/properties', apiPropertyPayload($changes), apiHeaders(apiStaff([], all: true)))->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(Property::count())->toBe(0);
})->with([
    [['title' => ''], 'title'], [['price' => -1], 'price'], [['price' => '1.234'], 'price'], [['area' => 0], 'area'], [['purpose' => ['sale']], 'purpose'],
    [['purpose' => 'other'], 'purpose'], [['status' => 'rented'], 'status'], [['purpose' => 'rent', 'status' => 'sold'], 'status'], [['purpose' => 'rent'], 'rent_period'],
    [['property_type' => 'invalid'], 'property_type'], [['owner_name' => ''], 'owner_name'], [['owner_phone' => '<script>'], 'owner_phone'], [['bedrooms' => 1.5], 'bedrooms'], [['is_published' => 'invalid'], 'is_published'],
]);
it('uploads safe photos and rejects spoofed paths invalid files and oversized images', function () {
    $owner = apiStaff([], all: true);
    $headers = apiHeaders($owner);
    $response = $this->postJson('/api/v1/admin/properties', apiPropertyPayload(['photos' => [UploadedFile::fake()->image('front.jpg')]]), $headers)->assertCreated();
    $p = Property::findOrFail($response->json('data.id'));
    Storage::disk('public')->assertExists($p->images[0]);
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['remove_images' => ['unrelated.jpg']]), $headers)->assertUnprocessable()->assertJsonValidationErrors('remove_images');
    $this->postJson('/api/v1/admin/properties', apiPropertyPayload(['photos' => [UploadedFile::fake()->create('bad.svg', 1, 'image/svg+xml')]]), $headers)->assertUnprocessable();
    $this->postJson('/api/v1/admin/properties', apiPropertyPayload(['photos' => [UploadedFile::fake()->image('large.jpg')->size(5121)]]), $headers)->assertUnprocessable();
});
it('enforces the combined existing and new photo limit', function () {
    $owner = apiStaff([], all: true);
    $p = apiProperty($owner, ['images' => array_map(fn ($i) => 'properties/'.$i.'.jpg', range(1, 10))]);
    $this->putJson('/api/v1/admin/properties/'.$p->id, apiPropertyPayload(['photos' => [UploadedFile::fake()->image('extra.jpg')]]), apiHeaders($owner))->assertUnprocessable()->assertJsonValidationErrors('photos');
});
it('returns JSON not HTML for unknown versioned routes', function () {
    $this->get('/api/v1/not-a-route')->assertNotFound()->assertHeader('Content-Type', 'application/json');
});
