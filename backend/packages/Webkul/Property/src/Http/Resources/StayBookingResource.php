<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Repositories\StayCancellationRepository;
use Webkul\Property\Repositories\StayPaymentRepository;
use Webkul\Property\Support\StayAttendance;

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
        $summary = $this->resource->getAttribute('ledger_snapshot') ?? app(StayPaymentRepository::class)->summary($this->resource);
        unset($data['ledger_snapshot']);
        $data = array_merge($data, $summary);
        if ($this->relationLoaded('events')) {
            $data['cancellation_requests'] = $this->customer_id !== null ? app(StayCancellationRepository::class)->history($this->id) : [];
        }
        if (! $this->relationLoaded('events')) {
            foreach (['request_id', 'guest_name', 'guest_email', 'guest_phone', 'payment_reference', 'notes', 'cancellation_reason', 'created_by'] as $key) {
                unset($data[$key]);
            }
        }

        return $data;
    }
}
