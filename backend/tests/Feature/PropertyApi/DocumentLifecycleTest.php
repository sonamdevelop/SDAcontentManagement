<?php

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Models\PropertyDocument;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Services\PropertyDocumentService;
use Webkul\Property\Support\DocumentFilePolicy;

// These tests deliberately commit real transactions so after-commit filesystem work is exercised.
beforeEach(function () {
    expect(DB::connection()->getDatabaseName())->toEndWith('_test');
    Storage::fake(DocumentFilePolicy::DISK);
    Storage::fake('public');
    $this->documentDisk = Storage::disk(DocumentFilePolicy::DISK);
    $this->documentActor = getDefaultAdmin();
    auth()->guard('user')->setUser($this->documentActor);
    $this->documentProperty = apiProperty($this->documentActor);
    $this->documentIds = [];
});
afterEach(function () {
    Storage::set(DocumentFilePolicy::DISK, $this->documentDisk);
    $repo = app(PropertyRepository::class);
    if ($property = $repo->find($this->documentProperty->id)) {
        $repo->deleteProperty($property);
    }
    PropertyDocument::withTrashed()->whereIn('id', $this->documentIds)->forceDelete();
});
function lifecycleDocument($test, string $title = 'Lifecycle registry')
{
    $file = UploadedFile::fake()->createWithContent('registry.pdf', "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
    $doc = app(PropertyDocumentService::class)->upload($test->documentProperty->id, ['title' => $title, 'category' => 'registry'], $file);
    $test->documentIds[] = $doc->id;

    return $doc;
}

it('deletes the stored file and metadata only after a document deletion commits', function () {
    $doc = lifecycleDocument($this);
    $disk = $this->documentDisk;
    $disk->assertExists($doc->path);
    app(PropertyDocumentService::class)->delete($this->documentProperty->id, $doc->id);
    $disk->assertMissing($doc->path);
    expect(PropertyDocument::withTrashed()->find($doc->id))->toBeNull();
});

it('preserves bytes and metadata when a document deletion rolls back', function () {
    $doc = lifecycleDocument($this);
    expect(fn () => DB::transaction(function () use ($doc) {
        app(PropertyDocumentService::class)->delete($this->documentProperty->id, $doc->id);
        throw new RuntimeException('Rollback deletion');
    }))->toThrow(RuntimeException::class, 'Rollback deletion');
    $this->documentDisk->assertExists($doc->path);
    expect(PropertyDocument::find($doc->id))->not->toBeNull();
});

it('removes private documents and public photos when the parent property deletion commits', function () {
    $first = lifecycleDocument($this);
    $second = lifecycleDocument($this);
    $this->documentProperty->update(['images' => ['properties/lifecycle.jpg']]);
    Storage::disk('public')->put('properties/lifecycle.jpg', 'photo');
    app(PropertyRepository::class)->deleteProperty($this->documentProperty);
    $this->documentDisk->assertMissing([$first->path, $second->path]);
    Storage::disk('public')->assertMissing('properties/lifecycle.jpg');
    expect(PropertyDocument::withTrashed()->whereIn('id', [$first->id, $second->id])->count())->toBe(0);
});

it('preserves documents and the parent when parent deletion rolls back', function () {
    $doc = lifecycleDocument($this);
    expect(fn () => DB::transaction(function () {
        app(PropertyRepository::class)->deleteProperty($this->documentProperty);
        throw new RuntimeException('Rollback parent deletion');
    }))->toThrow(RuntimeException::class, 'Rollback parent deletion');
    $this->documentDisk->assertExists($doc->path);
    expect(app(PropertyRepository::class)->find($this->documentProperty->id))->not->toBeNull()
        ->and(PropertyDocument::find($doc->id))->not->toBeNull();
});

it('rolls back a real inserted document and cleans bytes when its creation event fails', function () {
    Event::listen('eloquent.created: '.PropertyDocument::class, function ($doc) {
        if ($doc->title === 'Fail after insert') {
            throw new RuntimeException('Creation failed after insert');
        }
    });
    expect(fn () => lifecycleDocument($this, 'Fail after insert'))->toThrow(RuntimeException::class, 'Creation failed after insert');
    expect(PropertyDocument::where('property_id', $this->documentProperty->id)->count())->toBe(0)
        ->and($this->documentDisk->allFiles())->toBe([]);
});

it('retains inaccessible cleanup tombstones and retries failed file deletion through the command', function () {
    $doc = lifecycleDocument($this);
    $disk = $this->documentDisk;
    $mock = Mockery::mock($disk)->makePartial();
    $mock->shouldReceive('delete')->andReturn(false);
    Storage::set(DocumentFilePolicy::DISK, $mock);
    app(PropertyDocumentService::class)->delete($this->documentProperty->id, $doc->id);
    expect(PropertyDocument::find($doc->id))->toBeNull()->and(PropertyDocument::onlyTrashed()->find($doc->id))->not->toBeNull();
    $disk->assertExists($doc->path);
    try {
        app(PropertyDocumentService::class)->download($this->documentProperty->id, $doc->id);
        test()->fail('A deleted document must not be downloadable');
    } catch (ModelNotFoundException $exception) {
        expect($exception->getModel())->toBe(PropertyDocument::class);
    }
    $this->artisan('property-documents:cleanup')->assertExitCode(1);
    Storage::set(DocumentFilePolicy::DISK, $disk);
    $this->artisan('property-documents:cleanup')->assertExitCode(0);
    $disk->assertMissing($doc->path);
    expect(PropertyDocument::withTrashed()->find($doc->id))->toBeNull();
});

it('keeps parentless tombstones until a failed parent-deletion cleanup can be retried', function () {
    $doc = lifecycleDocument($this);
    $disk = $this->documentDisk;
    $mock = Mockery::mock($disk)->makePartial();
    $mock->shouldReceive('delete')->andReturn(false);
    Storage::set(DocumentFilePolicy::DISK, $mock);
    app(PropertyRepository::class)->deleteProperty($this->documentProperty);
    $tombstone = PropertyDocument::onlyTrashed()->findOrFail($doc->id);
    expect($tombstone->property_id)->toBeNull()->and(app(PropertyRepository::class)->find($this->documentProperty->id))->toBeNull();
    $disk->assertExists($doc->path);
    Storage::set(DocumentFilePolicy::DISK, $disk);
    $this->artisan('property-documents:cleanup')->assertExitCode(0);
    $disk->assertMissing($doc->path);
    expect(PropertyDocument::withTrashed()->find($doc->id))->toBeNull();
});

it('retries metadata cleanup idempotently after the file was already removed', function () {
    $doc = lifecycleDocument($this);
    $failures = 0;
    Event::listen('eloquent.forceDeleting: '.PropertyDocument::class, function ($row) use ($doc, &$failures) {
        if ($row->id === $doc->id && $failures++ === 0) {
            throw new RuntimeException('Metadata purge temporarily unavailable');
        }
    });
    app(PropertyDocumentService::class)->delete($this->documentProperty->id, $doc->id);
    $this->documentDisk->assertMissing($doc->path);
    expect(PropertyDocument::onlyTrashed()->find($doc->id))->not->toBeNull();
    $this->artisan('property-documents:cleanup')->assertExitCode(0);
    expect(PropertyDocument::withTrashed()->find($doc->id))->toBeNull();
});

it('uses an unserved private disk and registers hourly retry cleanup', function () {
    expect(config('filesystems.disks.property_documents.root'))->toBe(storage_path('app/private/property-documents'))
        ->and(config('filesystems.disks.property_documents.visibility'))->toBe('private')
        ->and(config('filesystems.disks.property_documents.serve'))->toBeFalse();
    $events = collect(app(Schedule::class)->events())->filter(fn ($event) => str_contains($event->command ?? '', 'property-documents:cleanup'));
    expect($events)->toHaveCount(1)->and($events->first()->expression)->toBe('0 * * * *');
});
