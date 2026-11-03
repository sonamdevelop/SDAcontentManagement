<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Models\Stay;

uses(DatabaseTransactions::class);
function contentFixture($actor, array $data = [])
{
    $stay = Stay::create(array_replace(['user_id' => $actor->id, 'name' => 'Public forest stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true], $data));
    $room = $stay->rooms()->create(['name' => 'Forest room', 'inventory' => 2, 'capacity' => 3, 'nightly_rate' => '1000.25', 'active' => true]);

    return [$stay, $room];
}
function contentData(array $data = []): array
{
    return array_replace(['description' => 'Quiet forest retreat', 'rules' => 'No smoking', 'amenities' => ['Wi-Fi', 'Parking'], 'is_published' => true], $data);
}
it('publishes curated stays with only active published room types and exact starting prices', function () {
    Storage::fake('public');
    $actor = apiStaff([], all: true);
    [$stay, $room] = contentFixture($actor);
    $h = apiHeaders($actor, ['stays:read', 'stays:write']);
    $this->getJson('/api/v1/stays/'.$stay->id)->assertNotFound();
    $this->postJson('/api/v1/admin/stays/'.$stay->id.'/content', contentData(['photos' => [UploadedFile::fake()->image('stay.jpg')]]), $h)->assertOk();
    $this->getJson('/api/v1/stays/'.$stay->id)->assertNotFound(); // No published room yet.
    $roomUrl = '/api/v1/admin/stays/'.$stay->id.'/rooms/'.$room->id.'/content';
    $this->postJson($roomUrl, contentData(['photos' => [UploadedFile::fake()->image('room.jpg')]]), $h)->assertOk();
    $stay->rooms()->create(['name' => 'Hidden cheap room', 'inventory' => 5, 'capacity' => 2, 'nightly_rate' => '0.01', 'active' => true]);
    $stay->rooms()->create(['name' => 'Inactive room', 'inventory' => 5, 'capacity' => 2, 'nightly_rate' => '0.02', 'active' => false, 'is_published' => true]);
    $result = $this->getJson('/api/v1/stays/'.$stay->id)->assertOk()->assertJsonPath('data.from_rate', '1000.25')->assertJsonPath('data.room_types_count', 1)->assertJsonCount(1, 'data.rooms')->assertJsonPath('data.rooms.0.name', 'Forest room')->assertJsonPath('data.amenities.0', 'Wi-Fi');
    expect($result->getContent())->not->toContain('user_id', 'inventory', 'booking', 'guest', 'Hidden cheap room', 'Inactive room', 'created_at');
    expect($result->headers->get('Cache-Control'))->toContain('no-store');
    expect($result->json('data.photos.0'))->toContain('/storage/stay-content/stays/');
    $this->getJson('/api/v1/stays?city=Dandeli&per_page=1')->assertOk()->assertJsonPath('meta.total', 1);
    $this->getJson('/api/v1/stays?city=Other')->assertOk()->assertJsonCount(0, 'data');
    $stay->update(['active' => false]);
    $this->getJson('/api/v1/stays/'.$stay->id)->assertNotFound();
    $stay->update(['active' => true, 'is_published' => false]);
    $this->getJson('/api/v1/stays/'.$stay->id)->assertNotFound();
    $stay->update(['is_published' => true]);
    $this->postJson($roomUrl, contentData(['is_published' => false]), $h)->assertOk();
    $this->getJson('/api/v1/stays/'.$stay->id)->assertNotFound();
    $this->getJson('/api/v1/admin/stays/'.$stay->id.'/content', $h)->assertOk()->assertJsonPath('data.rooms.0.inventory', 2);
});
it('enforces management scope, image boundaries and validation without changing booking inventory or rates', function () {
    Storage::fake('public');
    $actor = apiStaff([], all: true);
    [$stay, $room] = contentFixture($actor);
    $url = '/api/v1/admin/stays/'.$stay->id.'/content';
    $this->postJson($url, contentData())->assertUnauthorized();
    $this->postJson($url, contentData(), apiHeaders($actor, ['stays:read']))->assertForbidden();
    $reader = apiStaff(['stays'], visibility: 'global');
    $this->postJson($url, contentData(), apiHeaders($reader, ['stays:write']))->assertForbidden();
    $other = apiStaff([], all: true);
    $this->postJson($url, contentData(), apiHeaders($other, ['stays:write']))->assertNotFound();
    $manager = apiStaff(['stays', 'stays.manage'], visibility: 'global');
    $h = apiHeaders($manager, ['stays:write', 'stays:read']);
    $this->postJson($url, contentData(['photos' => [UploadedFile::fake()->image('view.jpg')], 'user_id' => $other->id, 'active' => false]), $h)->assertOk();
    expect($stay->refresh()->user_id)->toBe($actor->id)->and($stay->active)->toBeTrue();
    $existing = $stay->images[0];
    $this->postJson($url, contentData(['remove_images' => ['properties/not-owned.jpg']]), $h)->assertUnprocessable();
    $this->postJson($url, contentData(['photos' => [UploadedFile::fake()->create('unsafe.svg', 1, 'image/svg+xml')]]), $h)->assertUnprocessable();
    $this->postJson($url, contentData(['amenities' => ['Parking', 'Parking']]), $h)->assertUnprocessable();
    $this->postJson($url, contentData(['photos' => array_fill(0, 10, UploadedFile::fake()->image('view.jpg'))]), $h)->assertUnprocessable();
    $this->postJson($url, contentData(['remove_images' => [$existing], 'photos' => [UploadedFile::fake()->image('replacement.jpg')]]), $h)->assertOk()->assertJsonCount(1, 'data.images');
    $this->postJson('/api/v1/admin/stays/'.$stay->id.'/rooms/'.$room->id.'/content', contentData(['inventory' => 999, 'nightly_rate' => '1.00']), $h)->assertOk();
    expect($room->refresh()->inventory)->toBe(2)->and($room->nightly_rate)->toBe('1000.25');
    [$foreignStay, $foreignRoom] = contentFixture($actor);
    $this->postJson('/api/v1/admin/stays/'.$stay->id.'/rooms/'.$foreignRoom->id.'/content', contentData(), $h)->assertNotFound();
    $this->getJson('/api/v1/admin/stays/'.$stay->id.'/content', apiHeaders($other, ['stays:read']))->assertNotFound();
    $this->getJson('/api/v1/stays?per_page=51')->assertUnprocessable();
});
it('cleans newly uploaded photos when saving metadata fails', function () {
    Storage::fake('public');
    $actor = apiStaff([], all: true);
    [$stay] = contentFixture($actor);
    Event::listen('eloquent.updating: '.Stay::class, function () {
        throw new RuntimeException('Synthetic storage rollback test');
    });
    $this->postJson('/api/v1/admin/stays/'.$stay->id.'/content', contentData(['photos' => [UploadedFile::fake()->image('rollback.jpg')]]), apiHeaders($actor, ['stays:write']))->assertStatus(500);
    expect(Storage::disk('public')->allFiles())->toBe([]);
    expect($stay->refresh()->is_published)->toBeFalse();
});
