<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class PublicPropertyResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'title' => $this->title, 'description' => $this->description, 'purpose' => $this->purpose, 'property_type' => $this->property_type,
            'price' => $this->price, 'currency' => config('app.currency'), 'rent_period' => $this->rent_period, 'area' => $this->area, 'area_unit' => $this->area_unit,
            'bedrooms' => $this->bedrooms, 'bathrooms' => $this->bathrooms, 'city' => $this->city, 'state' => $this->state, 'status' => $this->status,
            'photos' => array_map(fn ($path) => Storage::disk('public')->url($path), $this->images ?? []), 'accepts_enquiries' => (bool) $this->accepts_enquiries, 'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
