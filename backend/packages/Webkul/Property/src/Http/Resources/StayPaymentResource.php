<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class StayPaymentResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'booking_id' => $this->booking_id, 'kind' => $this->kind, 'amount' => $this->amount, 'currency' => $this->currency, 'method' => $this->method, 'reference' => $this->reference, 'reason' => $this->reason, 'reversal_of' => $this->reversal_of, 'reversed_by' => $this->whenLoaded('reversal', fn () => $this->reversal?->id), 'actor_id' => $this->actor_id, 'created_at' => $this->created_at?->toIso8601String()];
    }
}
