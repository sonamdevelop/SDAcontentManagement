<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Repositories\PropertyModerationRepository;

uses(DatabaseTransactions::class);
beforeEach(fn () => Storage::fake('public'));
function moderationFixture()
{
    $u = apiStaff([], all: true);
    $h = apiHeaders($u, ['properties:read', 'properties:write', 'properties:moderate']);
    $d = apiPropertyPayload(['is_published' => true, 'accepts_enquiries' => true]);

    return [$u, $h, $d];
}
it('keeps new listings private until approved and excludes review/private data from public catalogue', function () {
    [$u,$h,$d] = moderationFixture();
    $p = $this->postJson('/api/v1/admin/properties', $d + ['moderation_status' => 'approved', 'moderated_by' => 999], $h)->assertCreated()->assertJsonPath('data.moderation_status', 'pending')->assertJsonPath('data.moderation_revision', 1);
    $id = $p->json('data.id');
    $this->getJson('/api/v1/properties/'.$id)->assertNotFound();
    $this->postJson('/api/v1/properties/'.$id.'/enquiries', apiEnquiry())->assertNotFound();
    $this->getJson('/api/v1/admin/property-moderation', $h)->assertOk()->assertHeader('Cache-Control', 'no-store, private')->assertJsonPath('data.0.id', $id);
    $url = '/api/v1/admin/properties/'.$id.'/moderation';
    $this->patchJson($url, ['expected_revision' => 1, 'decision' => 'approved', 'reason' => 'Reviewed photos and facts'], $h)->assertOk()->assertJsonPath('data.moderation_status', 'approved')->assertJsonCount(2, 'data.history');
    $public = $this->getJson('/api/v1/properties/'.$id)->assertOk();
    expect($public->getContent())->not->toContain('moderation', 'owner_name', 'owner_phone', 'user_id', 'Private street');
    $this->getJson($url, $h)->assertOk()->assertJsonMissingPath('data.listing.owner_phone')->assertJsonMissingPath('data.history.0.snapshot.address')->assertJsonPath('data.history.1.actor_id', $u->id);
});
it('invalidates approval on public edits while private changes publication switches and deal state preserve review', function () {
    [$u,$h,$d] = moderationFixture();
    $id = $this->postJson('/api/v1/admin/properties', $d, $h)->assertCreated()->json('data.id');
    $url = '/api/v1/admin/properties/'.$id.'/moderation';
    $decision = ['expected_revision' => 1, 'decision' => 'approved', 'reason' => 'Reviewed'];
    $this->patchJson($url, $decision, $h)->assertOk();
    $this->putJson('/api/v1/admin/properties/'.$id, array_replace($d, ['owner_name' => 'New private owner', 'address' => 'New private address', 'price' => '6500000.50', 'area' => '1200.00']), $h)->assertOk()->assertJsonPath('data.moderation_status', 'approved')->assertJsonPath('data.moderation_revision', 1);
    $this->putJson('/api/v1/admin/properties/'.$id, array_replace($d, ['is_published' => false]), $h)->assertOk()->assertJsonPath('data.moderation_revision', 1);
    $this->getJson('/api/v1/properties/'.$id)->assertNotFound();
    $this->putJson('/api/v1/admin/properties/'.$id, array_replace($d, ['title' => 'Changed public title']), $h)->assertOk()->assertJsonPath('data.moderation_status', 'pending')->assertJsonPath('data.moderation_revision', 2)->assertJsonPath('data.moderation_reason', null);
    $this->patchJson($url, $decision, $h)->assertConflict();
    $this->getJson('/api/v1/properties/'.$id)->assertNotFound();
    $this->patchJson($url, array_replace($decision, ['expected_revision' => 2]), $h)->assertOk();
    $this->putJson('/api/v1/admin/properties/'.$id, array_replace($d, ['title' => 'Changed public title', 'status' => 'unavailable']), $h)->assertOk()->assertJsonPath('data.moderation_status', 'approved')->assertJsonPath('data.moderation_revision', 2);
    $this->getJson('/api/v1/properties/'.$id)->assertNotFound();
});
it('preserves terminal decisions and resubmits rejected revisions with safe retry even after subsequent approval', function () {
    [$u,$h,$d] = moderationFixture();
    $id = $this->postJson('/api/v1/admin/properties', $d, $h)->assertCreated()->json('data.id');
    $url = '/api/v1/admin/properties/'.$id.'/moderation';
    $reject = ['expected_revision' => 1, 'decision' => 'rejected', 'reason' => 'Description needs review'];
    $this->patchJson($url, $reject, $h)->assertOk();
    $this->patchJson($url, $reject, $h)->assertOk()->assertJsonCount(2, 'data.history');
    $this->patchJson($url, array_replace($reject, ['decision' => 'approved']), $h)->assertConflict();
    $this->patchJson($url, array_replace($reject, ['reason' => 'Changed']), $h)->assertConflict();
    $submit = ['expected_revision' => 1, 'reason' => 'Please reconsider the original description'];
    $this->postJson($url.'/submit', $submit, $h)->assertOk()->assertJsonPath('data.moderation_revision', 2);
    $this->postJson($url.'/submit', $submit, $h)->assertOk()->assertJsonCount(3, 'data.history');
    $this->patchJson($url, ['expected_revision' => 2, 'decision' => 'approved', 'reason' => 'Reconsidered listing'], $h)->assertOk();
    $this->postJson($url.'/submit', $submit, $h)->assertOk()->assertJsonPath('data.moderation_status', 'approved')->assertJsonCount(4, 'data.history');
    $this->postJson($url.'/submit', array_replace($submit, ['reason' => 'Another submit']), $h)->assertConflict();
    $this->postJson($url.'/submit', array_replace($submit, ['reason' => strtolower($submit['reason'])]), $h)->assertConflict();
});
it('requires independent moderator permission and ability while enforcing own/global record scope', function () {
    [$u,$h,$d] = moderationFixture();
    $id = $this->postJson('/api/v1/admin/properties', $d, $h)->assertCreated()->json('data.id');
    $url = '/api/v1/admin/properties/'.$id.'/moderation';
    $decision = ['expected_revision' => 1, 'decision' => 'approved', 'reason' => 'Reviewed'];
    $this->patchJson($url, $decision)->assertUnauthorized();
    $this->patchJson($url, $decision, apiHeaders($u, ['properties:write']))->assertForbidden();
    $editor = apiStaff(['properties', 'properties.edit']);
    $p = apiProperty($editor);
    $p->forceFill(['moderation_status' => 'pending'])->save();
    $this->patchJson('/api/v1/admin/properties/'.$p->id.'/moderation', $decision, apiHeaders($editor, ['properties:moderate']))->assertForbidden();
    $outsider = apiStaff(['properties', 'properties.moderate']);
    $oh = apiHeaders($outsider, ['properties:read', 'properties:moderate']);
    $this->getJson($url, $oh)->assertNotFound();
    $this->patchJson($url, $decision, $oh)->assertNotFound();
    $this->getJson('/api/v1/admin/property-moderation', $oh)->assertOk()->assertJsonPath('meta.total', 0);
    $global = apiStaff(['properties', 'properties.moderate'], visibility: 'global');
    $this->patchJson($url, $decision, apiHeaders($global, ['properties:moderate']))->assertOk();
});
it('rolls back public edits and cleans new uploads if moderation history fails to persist', function () {
    [$u,$h,$d] = moderationFixture();
    $p = apiProperty($u);
    Storage::disk('public')->put('properties/original.png', 'Original');
    $p->update(['images' => ['properties/original.png']]);
    $mock = Mockery::mock(PropertyModerationRepository::class)->makePartial();
    $mock->shouldReceive('event')->once()->andThrow(new RuntimeException('Synthetic moderation audit failure'));
    $this->instance(PropertyModerationRepository::class, $mock);
    $this->put('/api/v1/admin/properties/'.$p->id, array_replace($d, ['title' => 'Changed', 'photos' => [UploadedFile::fake()->image('new.jpg')], 'remove_images' => ['properties/original.png']]), $h)->assertStatus(500);
    expect($p->fresh()->title)->toBe($d['title'])->and($p->fresh()->moderation_status)->toBe('approved')->and(Storage::disk('public')->allFiles())->toBe(['properties/original.png']);
});
it('protects photo review and retains immutable moderation history through property deletion', function () {
    [$u,$h,$d] = moderationFixture();
    $id = $this->postJson('/api/v1/admin/properties', $d, $h)->assertCreated()->json('data.id');
    $url = '/api/v1/admin/properties/'.$id.'/moderation';
    $this->patchJson($url, ['expected_revision' => 1, 'decision' => 'approved', 'reason' => 'Reviewed'], $h)->assertOk();
    $this->put('/api/v1/admin/properties/'.$id, $d + ['photos' => [UploadedFile::fake()->image('new.jpg')]], $h)->assertOk()->assertJsonPath('data.moderation_status', 'pending')->assertJsonPath('data.moderation_revision', 2);
    $this->deleteJson('/api/v1/admin/properties/'.$id, [], $h)->assertNoContent();
    expect(DB::table('property_moderation_events')->where('property_reference', $id)->count())->toBe(3)->and(DB::table('property_moderation_events')->where('property_reference', $id)->whereNull('property_id')->count())->toBe(3);
    $this->getJson($url, $h)->assertNotFound();
});
it('validates reasons revisions and filters before creating moderation history', function () {
    [$u,$h,$d] = moderationFixture();
    $id = $this->postJson('/api/v1/admin/properties', $d, $h)->assertCreated()->json('data.id');
    $url = '/api/v1/admin/properties/'.$id.'/moderation';
    foreach ([['expected_revision' => 0, 'decision' => 'approved', 'reason' => 'Reviewed'], ['expected_revision' => 1, 'decision' => 'invalid', 'reason' => 'Reviewed'], ['expected_revision' => 1, 'decision' => 'rejected', 'reason' => ' '], ['expected_revision' => 1, 'decision' => 'approved', 'reason' => str_repeat('a', 1001)]] as $data) {
        $this->patchJson($url, $data, $h)->assertUnprocessable();
    }
    $this->getJson('/api/v1/admin/property-moderation?status=anything', $h)->assertUnprocessable();
    $this->getJson('/api/v1/admin/property-moderation?per_page=101', $h)->assertUnprocessable();
    expect(DB::table('property_moderation_events')->where('property_reference', $id)->count())->toBe(1);
});
