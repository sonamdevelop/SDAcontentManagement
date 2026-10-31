<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class PropertyDealSummaryResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'property_id' => $this->property_id, 'lead_id' => $this->lead_id, 'user_id' => $this->user_id,
            'property_title' => $this->property_title, 'property_city' => $this->property_city, 'purpose' => $this->purpose, 'rent_period' => $this->rent_period,
            'status' => $this->status, 'agreed_price' => $this->agreed_price, 'booking_amount' => $this->booking_amount,
            'currency' => $this->currency, 'created_at' => $this->created_at?->toIso8601String(), 'confirmed_at' => $this->confirmed_at?->toIso8601String(), 'cancelled_at' => $this->cancelled_at?->toIso8601String()];
    }
}
