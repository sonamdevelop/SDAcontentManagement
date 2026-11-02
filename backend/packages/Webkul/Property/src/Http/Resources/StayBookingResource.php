<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\StayDates;

class StayBookingResource extends JsonResource
{
    public function toArray($request): array
    {
        $data = parent::toArray($request);
        unset($data['payload_hash']);
        $data['balance'] = StayDates::amount(DealMoney::cents($this->total) - DealMoney::cents($this->advance));
        if (! $this->relationLoaded('events')) {
            foreach (['request_id', 'guest_name', 'guest_email', 'guest_phone', 'payment_reference', 'notes', 'cancellation_reason', 'created_by'] as $key) {
                unset($data[$key]);
            }
        }

        return $data;
    }
}
