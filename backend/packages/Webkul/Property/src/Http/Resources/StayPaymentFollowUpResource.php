<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Support\DealMoney;

class StayPaymentFollowUpResource extends JsonResource
{
    public function toArray($request): array
    {
        $row = [];
        foreach (['id', 'room_type_id', 'room_name', 'guest_name', 'check_in', 'check_out', 'status', 'currency'] as $field) {
            $row[$field] = $this->resource->getAttribute($field);
        }
        foreach (['net_paid', 'amount_due', 'balance', 'refund_due'] as $field) {
            $row[$field] = DealMoney::normalize((string) $this->resource->getAttribute($field));
        }

        return $row;
    }
}
