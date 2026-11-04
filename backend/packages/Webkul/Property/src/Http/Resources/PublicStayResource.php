<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Support\DealMoney;

class PublicStayResource extends JsonResource
{
    private function content($model): array
    {
        return ['id' => $model->id, 'name' => $model->name, 'description' => $model->description ?? '', 'rules' => $model->rules ?? '', 'amenities' => $model->amenities ?? [], 'photos' => array_map(fn ($p) => Storage::disk('public')->url($p), $model->images ?? [])];
    }

    public function toArray($request): array
    {
        $row = $this->content($this->resource) + ['city' => $this->city, 'timezone' => $this->timezone, 'currency' => config('app.currency'), 'room_types_count' => $this->rooms_count, 'from_rate' => DealMoney::normalize((string) $this->rooms_min_nightly_rate)];
        if ($this->relationLoaded('rooms')) {
            $row['rooms'] = $this->rooms->map(fn ($r) => $this->content($r) + ['capacity' => $r->capacity, 'nightly_rate' => $r->nightly_rate])->all();
        }

        return $row;
    }
}
