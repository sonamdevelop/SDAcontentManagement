<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class EnquiryResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'property_id' => $this->property_id, 'property_title' => $this->property_title, 'lead_id' => $this->lead_id, 'name' => $this->name, 'email' => $this->email, 'phone' => $this->phone, 'message' => $this->message, 'consented_at' => $this->consented_at?->toIso8601String(), 'created_at' => $this->created_at?->toIso8601String()];
    }
}
