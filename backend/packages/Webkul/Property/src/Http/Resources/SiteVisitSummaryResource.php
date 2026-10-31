<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class SiteVisitSummaryResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'property_id' => $this->property_id, 'property_title' => $this->property_title, 'property_city' => $this->property_city,
            'lead_id' => $this->lead_id, 'customer_name' => $this->customer_name, 'user_id' => $this->user_id, 'status' => $this->status,
            'starts_at' => $this->starts_at->toIso8601String(), 'ends_at' => $this->ends_at->toIso8601String(), 'reschedule_count' => $this->reschedule_count, 'created_at' => $this->created_at->toIso8601String()];
    }
}
