<?php

namespace Webkul\Property\Repositories;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\Property;

class PropertyRepository extends Repository
{
    public function model()
    {
        return Property::class;
    }

    public function publicQuery()
    {
        return $this->model->newQuery()->where('is_published', true)->where('status', 'available')->whereHas('agent', fn ($q) => $q->where('status', 1));
    }

    public function findPublic(int $id)
    {
        return $this->publicQuery()->findOrFail($id);
    }

    public function authorized(int $id, bool $lock = false)
    {
        $query = $this->model->newQuery();
        if ($lock) {
            $query->lockForUpdate();
        }
        $record = $query->findOrFail($id);
        $ids = bouncer()->getAuthorizedUserIds();
        abort_if($ids !== null && ! in_array($record->user_id, $ids), 404);

        return $record;
    }

    public function listing(array $filters, ?array $ids = null, bool $public = false)
    {
        $q = $public ? $this->publicQuery() : $this->model->newQuery();
        if (! $public && $ids !== null) {
            $q->whereIn('user_id', $ids);
        }
        if (! empty($filters['q'])) {
            $q->where(fn ($q) => $q->where('title', 'like', '%'.$filters['q'].'%')->orWhere('city', 'like', '%'.$filters['q'].'%'));
        }
        foreach (['city', 'purpose', 'property_type', 'status'] as $key) {
            if (! empty($filters[$key])) {
                $q->where($key, $filters[$key]);
            }
        }
        foreach (['min_price' => '>=', 'max_price' => '<='] as $key => $op) {
            if (isset($filters[$key])) {
                $q->where('price', $op, $filters[$key]);
            }
        }

        return $q->latest('id')->paginate($filters['per_page'] ?? 15)->withQueryString();
    }

    public function saveProperty(array $data, array $photos = [], array $remove = [], $property = null)
    {
        $uploaded = [];
        try {
            return DB::transaction(function () use ($data, $photos, $remove, $property, &$uploaded) {
                if ($property) {
                    $property = $this->model->newQuery()->lockForUpdate()->findOrFail($property->id);
                }
                $existing = $property?->images ?? [];
                if (array_diff($remove, $existing)) {
                    throw ValidationException::withMessages(['remove_images' => trans('admin::app.property-api.invalid-image')]);
                }
                $remaining = array_values(array_diff($existing, $remove));
                if (count($remaining) + count($photos) > 10) {
                    throw ValidationException::withMessages(['photos' => trans('admin::app.property-api.image-limit')]);
                }
                foreach ($photos as $photo) {
                    $path = $photo->store('properties', 'public');
                    if (! $path) {
                        throw new \RuntimeException('Photo storage failed');
                    }
                    $uploaded[] = $path;
                }
                $data['images'] = array_merge($remaining, $uploaded);
                $data['rent_period'] = $data['purpose'] === 'rent' ? $data['rent_period'] : null;
                $saved = $property ? tap($property)->update($data) : $this->create($data);
                if ($remove) {
                    DB::afterCommit(fn () => Storage::disk('public')->delete($remove));
                }

                return $saved;
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($uploaded);
            throw $e;
        }
    }

    public function deleteProperty($property): void
    {
        DB::transaction(function () use ($property) {
            $property = $this->model->newQuery()->lockForUpdate()->findOrFail($property->id);
            $images = $property->images ?? [];
            app(PropertyDocumentRepository::class)->removeForProperty($property->id);
            $this->delete($property->id);
            DB::afterCommit(fn () => Storage::disk('public')->delete($images));
        });
    }
}
