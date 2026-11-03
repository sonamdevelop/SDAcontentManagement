<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\StayAttendance;
use Webkul\Property\Support\StayDates;

class StayBookingResource extends JsonResource
{
    public function toArray($request): array
    {
        $data = parent::toArray($request);
        unset($data['payload_hash']);
        // Newly inserted models do not contain nullable database-default attributes yet.
        // Keep create/replay/detail response shapes identical without requiring a reload.
        foreach (['guest_email', 'guest_phone', 'payment_reference', 'notes', 'cancellation_reason'] as $field) {
            $data[$field] = $this->resource->getAttribute($field);
        }
        foreach (['checked_in_at', 'checked_out_at', 'cancelled_at'] as $field) {
            $data[$field] = $this->resource->getAttribute($field)?->toIso8601String();
        }
        $data['attendance_status'] = StayAttendance::status($this->checked_in_at !== null, $this->checked_out_at !== null);
        $data['balance'] = StayDates::amount(DealMoney::cents($this->total) - DealMoney::cents($this->advance));
        if (! $this->relationLoaded('events')) {
            foreach (['request_id', 'guest_name', 'guest_email', 'guest_phone', 'payment_reference', 'notes', 'cancellation_reason', 'created_by'] as $key) {
                unset($data[$key]);
            }
        }

        return $data;
    }
}
