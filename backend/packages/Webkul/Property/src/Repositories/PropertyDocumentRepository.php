<?php

namespace Webkul\Property\Repositories;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\PropertyDocument;
use Webkul\Property\Support\DocumentFilePolicy;

class PropertyDocumentRepository extends Repository
{
    public function model()
    {
        return PropertyDocument::class;
    }

    public function forProperty(int $propertyId, int $id, bool $lock = false)
    {
        $query = $this->model->newQuery()->where('property_id', $propertyId);
        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->findOrFail($id);
    }

    public function listing(int $propertyId, array $filters)
    {
        $query = $this->model->newQuery()->where('property_id', $propertyId);
        if (isset($filters['category'])) {
            $query->where('category', $filters['category']);
        }

        return $query->latest('id')->paginate($filters['per_page'] ?? 20)->withQueryString();
    }

    /** Call only inside the parent property's locked transaction. */
    public function removeDocument($document): void
    {
        $document->delete();
        DB::afterCommit(fn () => $this->purgeDeleted($document->id));
    }

    public function removeForProperty(int $propertyId): void
    {
        $documents = $this->model->newQuery()->where('property_id', $propertyId)->lockForUpdate()->get();
        foreach ($documents as $document) {
            $this->removeDocument($document);
        }
    }

    /** Missing files are an idempotent delete. Failed purges retain an inaccessible tombstone. */
    public function purgeDeleted(int $id): bool
    {
        try {
            DB::transaction(function () use ($id) {
                $document = $this->model->newQuery()->onlyTrashed()->lockForUpdate()->find($id);
                if ($document === null) {
                    return;
                }
                if (! Storage::disk(DocumentFilePolicy::DISK)->delete($document->path)) {
                    throw new \RuntimeException('Document deletion failed.');
                }
                $document->forceDelete();
            });

            return true;
        } catch (\Throwable $exception) {
            Log::warning('Private document cleanup pending.', ['document_id' => $id, 'exception_class' => get_class($exception)]);

            return false;
        }
    }
}
