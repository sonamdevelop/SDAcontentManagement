<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use League\Flysystem\UnableToWriteFile;
use Webkul\Property\Models\PropertyDocument;
use Webkul\Property\Repositories\PropertyDocumentRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Services\PropertyDocumentService;
use Webkul\Property\Support\DocumentFilePolicy;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);

beforeEach(function () {
    Storage::fake(DocumentFilePolicy::DISK);
    Storage::fake('public');
});
function documentPdf(string $name = 'registry.pdf'): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
}
function documentBody(array $changes = []): array
{
    return array_replace(['title' => 'Property registry', 'category' => 'registry', 'description' => 'Private ownership record', 'file' => documentPdf()], $changes);
}
function documentPermissions(): array
{
    return ['properties', 'properties.documents', 'properties.documents.create', 'properties.documents.delete'];
}
function documentUrl($property, ?int $id = null): string
{
    return '/api/v1/admin/properties/'.$property->id.'/documents'.($id === null ? '' : '/'.$id);
}
function uploadDocument($test, $property, $headers, array $changes = [])
{
    return $test->post(documentUrl($property), documentBody($changes), array_merge(['Accept' => 'application/json'], $headers))->assertCreated();
}

it('stores private bytes and server-owned metadata without exposing storage paths', function () {
    $actor = apiStaff(documentPermissions());
    $p = apiProperty($actor, ['is_published' => false]);
    $h = apiHeaders($actor);
    $file = documentPdf();
    $bytes = file_get_contents($file->getRealPath());
    $r = uploadDocument($this, $p, $h, ['file' => $file, 'path' => 'public/secret.php', 'uploaded_by' => 999, 'property_id' => 999, 'mime_type' => 'text/html', 'size_bytes' => 1, 'sha256' => 'spoof'])
        ->assertJsonPath('data.property_id', $p->id)->assertJsonPath('data.uploaded_by', $actor->id)
        ->assertJsonPath('data.mime_type', 'application/pdf')->assertJsonPath('data.size_bytes', strlen($bytes))
        ->assertJsonPath('data.sha256', hash('sha256', $bytes))->assertJsonPath('data.original_name', 'registry.pdf')
        ->assertJsonMissingPath('data.path')->assertJsonMissingPath('data.disk');
    $doc = PropertyDocument::findOrFail($r->json('data.id'));
    expect($doc->path)->toMatch('/^'.$p->id.'\/[0-9a-f-]{36}\.pdf$/')->and($doc->toArray())->not->toHaveKey('path');
    Storage::disk(DocumentFilePolicy::DISK)->assertExists($doc->path);
    expect(Storage::disk(DocumentFilePolicy::DISK)->get($doc->path))->toBe($bytes)->and(Storage::disk('public')->allFiles())->toBe([]);
    expect($r->headers->get('Cache-Control'))->toContain('no-store');
    $list = $this->getJson(documentUrl($p), $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonMissingPath('data.0.path');
    expect($list->headers->get('Cache-Control'))->toContain('no-store');
});

it('streams authenticated attachments with the original bytes and safe headers', function ($kind) {
    $actor = apiStaff(documentPermissions());
    $p = apiProperty($actor);
    $h = apiHeaders($actor);
    $file = match ($kind) {
        'pdf' => documentPdf(), 'jpg' => UploadedFile::fake()->image('front.jpg'), 'png' => UploadedFile::fake()->image('plan.png')
    };
    $bytes = file_get_contents($file->getRealPath());
    $r = uploadDocument($this, $p, $h, ['file' => $file]);
    $response = $this->get($r->json('data.download_url'), $h)->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Length', (string) strlen($bytes))->assertDownload($r->json('data.original_name'));
    expect($response->streamedContent())->toBe($bytes)->and($response->headers->get('Cache-Control'))->toContain('no-store');
})->with(['pdf', 'jpg', 'png']);

it('requires authentication on every document endpoint', function () {
    $p = apiProperty(apiStaff());
    $this->getJson(documentUrl($p))->assertUnauthorized();
    $this->post(documentUrl($p), documentBody(), ['Accept' => 'application/json'])->assertUnauthorized();
    $this->getJson(documentUrl($p, 1).'/download')->assertUnauthorized();
    $this->deleteJson(documentUrl($p, 1))->assertUnauthorized();
});

it('requires source permission document action permission and token ability independently', function () {
    $actor = apiStaff(documentPermissions());
    $p = apiProperty($actor);
    $h = apiHeaders($actor);
    $id = uploadDocument($this, $p, $h)->json('data.id');
    $operations = [
        ['GET', documentUrl($p), 'properties.documents', 'documents:read'],
        ['GET', documentUrl($p, $id).'/download', 'properties.documents', 'documents:read'],
        ['POST', documentUrl($p), 'properties.documents.create', 'documents:write'],
        ['DELETE', documentUrl($p, $id), 'properties.documents.delete', 'documents:write'],
    ];
    foreach ($operations as [$method, $url, $permission, $ability]) {
        foreach ([['properties'], [$permission]] as $perms) {
            $actor->role->update(['permissions' => $perms]);
            $this->json($method, $url, [], $h)->assertForbidden();
        }
        $actor->role->update(['permissions' => documentPermissions()]);
        $this->json($method, $url, [], apiHeaders($actor, ['properties:read']))->assertForbidden();
    }
    expect(PropertyDocument::count())->toBe(1);
});

it('keeps ownership scopes even for all-permission roles and rejects mismatched parent ids', function () {
    $owner = apiStaff([], all: true);
    $other = apiStaff([], all: true);
    $p = apiProperty($owner);
    $q = apiProperty($other);
    $h = apiHeaders($owner);
    $oh = apiHeaders($other);
    $id = uploadDocument($this, $p, $h)->json('data.id');
    $this->getJson(documentUrl($p), $oh)->assertNotFound();
    $this->post(documentUrl($p), documentBody(), array_merge(['Accept' => 'application/json'], $oh))->assertNotFound();
    $this->getJson(documentUrl($p, $id).'/download', $oh)->assertNotFound();
    $this->deleteJson(documentUrl($p, $id), [], $oh)->assertNotFound();
    // A globally authorized user still cannot substitute the parent property in a nested URL.
    $other->update(['view_permission' => 'global']);
    $this->getJson(documentUrl($q, $id).'/download', $oh)->assertNotFound();
    $this->deleteJson(documentUrl($q, $id), [], $oh)->assertNotFound();
    expect(PropertyDocument::count())->toBe(1);
});

it('supports group and global visibility while denying an empty group', function () {
    $owner = apiStaff(documentPermissions());
    $p = apiProperty($owner);
    $id = uploadDocument($this, $p, apiHeaders($owner))->json('data.id');
    $manager = apiStaff(documentPermissions(), 'group');
    $h = apiHeaders($manager);
    $this->getJson(documentUrl($p), $h)->assertNotFound();
    $g = Group::create(['name' => 'Document team']);
    $g->users()->attach([$manager->id, $owner->id]);
    $this->getJson(documentUrl($p), $h)->assertOk()->assertJsonCount(1, 'data');
    $this->get(documentUrl($p, $id).'/download', $h)->assertOk();
    $manager->groups()->detach();
    $manager->update(['view_permission' => 'global']);
    $this->getJson(documentUrl($p), $h)->assertOk()->assertJsonCount(1, 'data');
});

it('follows the current property owner after reassignment rather than the uploader', function () {
    $a = apiStaff(documentPermissions());
    $b = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $id = uploadDocument($this, $p, apiHeaders($a))->json('data.id');
    $p->update(['user_id' => $b->id]);
    $this->getJson(documentUrl($p), apiHeaders($a))->assertNotFound();
    $this->getJson(documentUrl($p), apiHeaders($b))->assertOk()->assertJsonPath('data.0.uploaded_by', $a->id);
    $this->get(documentUrl($p, $id).'/download', apiHeaders($b))->assertOk();
});

it('never exposes private documents through public or general property APIs', function () {
    $a = apiStaff([], all: true);
    $p = apiProperty($a);
    $h = apiHeaders($a);
    $r = uploadDocument($this, $p, $h);
    $id = $r->json('data.id');
    foreach (['/api/v1/properties', '/api/v1/properties/'.$p->id, '/api/v1/admin/properties/'.$p->id] as $url) {
        $response = $this->getJson($url, $h)->assertOk();
        expect($response->getContent())->not->toContain('Property registry', 'Private ownership record', 'download_url', 'property-documents', $r->json('data.sha256'));
    }
    $this->getJson('/api/v1/properties/'.$p->id.'/documents')->assertNotFound();
    $this->getJson('/api/v1/properties/'.$p->id.'/documents/'.$id.'/download')->assertNotFound();
});

it('filters and paginates document metadata and validates filters', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $h = apiHeaders($a);
    uploadDocument($this, $p, $h);
    $id = uploadDocument($this, $p, $h, ['category' => 'floor_plan'])->json('data.id');
    $this->getJson(documentUrl($p).'?per_page=1', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.id', $id);
    $this->getJson(documentUrl($p).'?category=floor_plan', $h)->assertOk()->assertJsonCount(1, 'data');
    foreach (['per_page=101', 'page=0', 'category=invalid'] as $filter) {
        $this->getJson(documentUrl($p).'?'.$filter, $h)->assertUnprocessable();
    }
});

it('rejects invalid document metadata and unsafe or mismatched file content', function ($case, $field) {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $h = array_merge(['Accept' => 'application/json'], apiHeaders($a));
    $changes = match ($case) {
        'missing-file' => ['file' => null], 'missing-title' => ['title' => null], 'long-title' => ['title' => str_repeat('a', 151)],
        'long-description' => ['description' => str_repeat('a', 1001)], 'category' => ['category' => 'script'],
        'oversize' => ['file' => documentPdf()->size(10241)],
        'empty' => ['file' => UploadedFile::fake()->createWithContent('registry.pdf', '')],
        'script' => ['file' => UploadedFile::fake()->createWithContent('registry.pdf', '<?php echo "secret";')],
        'html' => ['file' => UploadedFile::fake()->createWithContent('agreement.pdf', '<html><script>alert(1)</script></html>')],
        'svg' => ['file' => UploadedFile::fake()->createWithContent('plan.svg', '<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
        'extension' => ['file' => documentPdf('contract.php')], 'mismatch' => ['file' => documentPdf('contract.jpg')],
        'double-extension' => ['file' => documentPdf('contract.pdf.php')],
    };
    $this->post(documentUrl($p), documentBody($changes), $h)->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(PropertyDocument::count())->toBe(0)->and(Storage::disk(DocumentFilePolicy::DISK)->allFiles())->toBe([]);
})->with([
    ['missing-file', 'file'], ['missing-title', 'title'], ['long-title', 'title'], ['long-description', 'description'], ['category', 'category'],
    ['oversize', 'file'], ['empty', 'file'], ['script', 'file'], ['html', 'file'], ['svg', 'file'], ['extension', 'file'], ['mismatch', 'file'], ['double-extension', 'file'],
]);

it('caps active document counts before writing a new file', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $h = apiHeaders($a);
    for ($i = 0; $i < DocumentFilePolicy::MAX_FILES; $i++) {
        PropertyDocument::create(['property_id' => $p->id, 'title' => 'Existing', 'category' => 'other', 'original_name' => 'existing.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 10, 'sha256' => str_repeat('a', 64), 'path' => $p->id.'/fixture-'.$i.'.pdf']);
    }
    $this->post(documentUrl($p), documentBody(), array_merge(['Accept' => 'application/json'], $h))->assertUnprocessable()->assertJsonValidationErrors('file');
    expect(Storage::disk(DocumentFilePolicy::DISK)->allFiles())->toBe([]);
});

it('removes uploaded bytes if metadata insertion or an enclosing transaction rolls back', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    auth()->guard('user')->setUser($a);
    $repo = Mockery::mock(PropertyDocumentRepository::class.'[create]', [app()]);
    $repo->shouldReceive('create')->once()->andThrow(new RuntimeException('Metadata failed'));
    $service = new PropertyDocumentService(app(PropertyRepository::class), $repo);
    expect(fn () => $service->upload($p->id, ['title' => 'Registry', 'category' => 'registry'], documentPdf()))->toThrow(RuntimeException::class, 'Metadata failed');
    expect(Storage::disk(DocumentFilePolicy::DISK)->allFiles())->toBe([]);
    expect(fn () => DB::transaction(function () use ($p) {
        app(PropertyDocumentService::class)->upload($p->id, ['title' => 'Registry', 'category' => 'registry'], documentPdf());
        throw new RuntimeException('Parent failed');
    }))->toThrow(RuntimeException::class, 'Parent failed');
    expect(PropertyDocument::count())->toBe(0)->and(Storage::disk(DocumentFilePolicy::DISK)->allFiles())->toBe([]);
});

it('returns a retryable error when private storage cannot write', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $disk = Storage::disk(DocumentFilePolicy::DISK);
    $mock = Mockery::mock($disk)->makePartial();
    $mock->shouldReceive('putFileAs')->once()->andThrow(UnableToWriteFile::atLocation('private'));
    Storage::set(DocumentFilePolicy::DISK, $mock);
    $this->post(documentUrl($p), documentBody(), array_merge(['Accept' => 'application/json'], apiHeaders($a)))->assertStatus(503);
    expect(PropertyDocument::count())->toBe(0);
});

it('returns JSON not found for missing records or missing stored files', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $h = apiHeaders($a);
    $this->getJson(documentUrl($p, 99999999).'/download', $h)->assertNotFound();
    $id = uploadDocument($this, $p, $h)->json('data.id');
    $doc = PropertyDocument::findOrFail($id);
    Storage::disk(DocumentFilePolicy::DISK)->delete($doc->path);
    $this->get(documentUrl($p, $id).'/download', $h)->assertNotFound()->assertHeader('Content-Type', 'application/json');
});

it('grants document abilities only on new logins and revokes access after logout or deactivation', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $this->getJson(documentUrl($p), apiHeaders($a, ['properties:read']))->assertForbidden();
    $r = $this->postJson('/api/v1/auth/login', ['email' => $a->email, 'password' => 'Password123!', 'device_name' => 'Documents test'])->assertCreated();
    $h = ['Authorization' => 'Bearer '.$r->json('data.access_token')];
    $id = uploadDocument($this, $p, $h)->json('data.id');
    $a->update(['status' => 0]);
    $this->getJson(documentUrl($p), $h)->assertForbidden();
    $a->update(['status' => 1]);
    $this->postJson('/api/v1/auth/logout', [], $h)->assertNoContent();
    $this->getJson(documentUrl($p, $id).'/download', $h)->assertUnauthorized();
});

it('deletes documents through the API and immediately denies repeat reads or deletes', function () {
    $a = apiStaff(documentPermissions());
    $p = apiProperty($a);
    $h = apiHeaders($a);
    $id = uploadDocument($this, $p, $h)->json('data.id');
    $this->deleteJson(documentUrl($p, $id), [], $h)->assertNoContent();
    $this->getJson(documentUrl($p), $h)->assertOk()->assertJsonCount(0, 'data');
    $this->getJson(documentUrl($p, $id).'/download', $h)->assertNotFound();
    $this->deleteJson(documentUrl($p, $id), [], $h)->assertNotFound();
});
