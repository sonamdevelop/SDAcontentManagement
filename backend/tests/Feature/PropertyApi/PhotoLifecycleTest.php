<?php

use Illuminate\Database\QueryException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Repositories\PropertyRepository;

it('deletes replaced and removed photos after committed database changes', function () {
    Storage::fake('public');
    $repo = app(PropertyRepository::class);
    $property = null;
    try {
        $data = apiPropertyPayload(['user_id' => getDefaultAdmin()->id]);
        $property = $repo->saveProperty($data, [UploadedFile::fake()->image('front.jpg')]);
        $old = $property->images[0];
        Storage::disk('public')->assertExists($old);
        $property = $repo->saveProperty($data, [UploadedFile::fake()->image('updated.jpg')], [$old], $property);
        Storage::disk('public')->assertMissing($old);
        $new = $property->images[0];
        Storage::disk('public')->assertExists($new);
        $repo->deleteProperty($property);
        $property = null;
        Storage::disk('public')->assertMissing($new);
    } finally {
        if ($property && $repo->find($property->id)) {
            $repo->deleteProperty($property);
        }
    }
});

it('removes uploaded files when property insertion rolls back', function () {
    Storage::fake('public');
    $repo = app(PropertyRepository::class);
    expect(fn () => $repo->saveProperty(apiPropertyPayload(['user_id' => 4294967294]), [UploadedFile::fake()->image('rollback.jpg')]))->toThrow(QueryException::class);
    expect(Storage::disk('public')->allFiles('properties'))->toBe([]);
});
