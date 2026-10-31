<?php

namespace Webkul\Property\Http\Resources;

class AdminPropertyResource extends PublicPropertyResource
{
    public function toArray($request): array
    {
        return array_merge(parent::toArray($request), ['address' => $this->address, 'postal_code' => $this->postal_code, 'owner_name' => $this->owner_name, 'owner_phone' => $this->owner_phone, 'user_id' => $this->user_id, 'is_published' => (bool) $this->is_published, 'image_paths' => $this->images ?? [], 'updated_at' => $this->updated_at?->toIso8601String()]);
    }
}
