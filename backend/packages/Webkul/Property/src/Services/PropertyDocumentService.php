<?php

namespace Webkul\Property\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use League\Flysystem\FilesystemException;
use Webkul\Property\Repositories\PropertyDocumentRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Support\DocumentFilePolicy;

class PropertyDocumentService
{
    public function __construct(protected PropertyRepository $properties, protected PropertyDocumentRepository $documents) {}

    public function upload(int $propertyId, array $data, UploadedFile $file)
    {
        $path = null;
        $operation = function () use ($propertyId, $data, $file, &$path) {
            $this->properties->authorized($propertyId, true);
            // Locking read avoids stale quota counts when concurrent uploads wait on the parent.
            $count = $this->documents->getModel()->newQuery()->where('property_id', $propertyId)->lockForUpdate()->get(['id'])->count();
            if ($count >= DocumentFilePolicy::MAX_FILES) {
                throw ValidationException::withMessages(['file' => trans('admin::app.property-api.document-limit')]);
            }
            $mime = DocumentFilePolicy::detectedMime($file->getRealPath());
            $filename = Str::uuid().'.'.DocumentFilePolicy::TYPES[$mime][0];
            $path = $propertyId.'/'.$filename;
            DB::afterRollBack(fn () => $this->removeUncommitted($path));
            $stored = Storage::disk(DocumentFilePolicy::DISK)->putFileAs((string) $propertyId, $file, $filename);
            if ($stored !== $path) {
                abort(503, trans('admin::app.property-api.document-storage'));
            }

            return $this->documents->create(array_merge(array_intersect_key($data, array_flip(['title', 'category', 'description'])), [
                'property_id' => $propertyId, 'uploaded_by' => auth()->guard('user')->id(),
                'path' => $path, 'original_name' => DocumentFilePolicy::downloadName($file->getClientOriginalName(), $mime),
                'mime_type' => $mime, 'size_bytes' => $file->getSize(), 'sha256' => hash_file('sha256', $file->getRealPath()),
            ]));
        };
        try {
            // Join an enclosing transaction so its rollback callback owns the uploaded file.
            return DB::transactionLevel() > 0 ? $operation() : DB::transaction($operation);
        } catch (\Throwable $exception) {
            if ($path !== null) {
                $this->removeUncommitted($path);
            }
            if ($exception instanceof FilesystemException) {
                abort(503, trans('admin::app.property-api.document-storage'));
            }
            throw $exception;
        }
    }

    protected function removeUncommitted(string $path): void
    {
        try {
            if (! Storage::disk(DocumentFilePolicy::DISK)->delete($path)) {
                throw new \RuntimeException('Rollback file removal failed.');
            }
        } catch (\Throwable $exception) {
            Log::error('Private document rollback cleanup failed.', ['path' => $path, 'exception_class' => get_class($exception)]);
        }
    }

    public function delete(int $propertyId, int $id): void
    {
        DB::transaction(function () use ($propertyId, $id) {
            $this->properties->authorized($propertyId, true);
            $this->documents->removeDocument($this->documents->forProperty($propertyId, $id, true));
        });
    }

    public function download(int $propertyId, int $id)
    {
        $this->properties->authorized($propertyId);
        $document = $this->documents->forProperty($propertyId, $id);
        try {
            $disk = Storage::disk(DocumentFilePolicy::DISK);
            abort_unless($disk->exists($document->path), 404);
            $stream = $disk->readStream($document->path);
            if (! is_resource($stream)) {
                abort(503, trans('admin::app.property-api.document-storage'));
            }
        } catch (FilesystemException $exception) {
            abort(503, trans('admin::app.property-api.document-storage'));
        }

        return response()->streamDownload(function () use ($stream) {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, $document->original_name, [
            'Content-Type' => $document->mime_type, 'Content-Length' => (string) $document->size_bytes,
            'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'private, no-store',
        ]);
    }
}
