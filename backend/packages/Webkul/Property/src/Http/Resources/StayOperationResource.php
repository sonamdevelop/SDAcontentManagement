<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Support\StayAttendance;

class StayOperationResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'room_type_id' => $this->room_type_id, 'room_name' => $this->room_name,
            'guest_name' => $this->guest_name, 'check_in' => $this->check_in, 'check_out' => $this->check_out,
            'rooms' => $this->rooms, 'guests' => $this->guests,
            'attendance_status' => StayAttendance::status($this->checked_in_at !== null, $this->checked_out_at !== null),
            'checked_in_at' => $this->checked_in_at?->toIso8601String(), 'checked_out_at' => $this->checked_out_at?->toIso8601String()];
    }
}
