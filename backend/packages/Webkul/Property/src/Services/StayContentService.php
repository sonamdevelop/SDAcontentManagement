<?php

namespace Webkul\Property\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\StayContent;

class StayContentService
{
    public function __construct(protected StayRepository $stays) {}

    public function save(int $stayId, ?int $roomId, array $data, array $photos)
    {
        $uploaded = [];
        try {
            return DB::transaction(function () use ($stayId, $roomId, $data, $photos, &$uploaded) {
                $stay = $this->stays->authorized($stayId, true);
                $target = $roomId ? $stay->rooms()->lockForUpdate()->findOrFail($roomId) : $stay;
                $remove = $data['remove_images'] ?? [];
                try {
                    $remaining = StayContent::remaining($target->images ?? [], $remove, count($photos));
                } catch (\InvalidArgumentException $e) {
                    throw ValidationException::withMessages([($e->getMessage() === 'invalid-image' ? 'remove_images' : 'photos') => trans('admin::app.property-api.'.$e->getMessage())]);
                }
                foreach ($photos as $photo) {
                    $path = $photo->store('stay-content/'.($roomId ? 'rooms/' : 'stays/').$target->id, 'public');
                    if (! $path) {
                        throw new \RuntimeException('Photo storage failed.');
                    }
                    $uploaded[] = $path;
                }
                $target->update(['description' => trim($data['description'] ?? ''), 'rules' => trim($data['rules'] ?? ''), 'amenities' => array_values(array_map('trim', $data['amenities'] ?? [])), 'images' => array_merge($remaining, $uploaded), 'is_published' => $data['is_published']]);
                DB::afterCommit(function () use ($remove) {
                    try {
                        Storage::disk('public')->delete($remove);
                    } catch (\Throwable $e) {
                        report($e); // Metadata has committed; a cleanup error must not delete new photos.
                    }
                });

                return $target;
            });
        } catch (\Throwable $e) {
            Storage::disk('public')->delete($uploaded);
            throw $e;
        }
    }
}
