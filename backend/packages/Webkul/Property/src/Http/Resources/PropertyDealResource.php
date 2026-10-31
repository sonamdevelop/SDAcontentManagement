<?php

namespace Webkul\Property\Http\Resources;

class PropertyDealResource extends PropertyDealSummaryResource
{
    public function toArray($request): array
    {
        return array_merge(parent::toArray($request), [
            'request_id' => $this->request_id, 'person_id' => $this->person_id, 'created_by' => $this->created_by,
            'customer_name' => $this->customer_name, 'customer_email' => $this->customer_email, 'customer_phone' => $this->customer_phone,
            'payment_reference' => $this->payment_reference, 'notes' => $this->notes, 'cancellation_reason' => $this->cancellation_reason,
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => ['id' => $event->id, 'actor_id' => $event->actor_id, 'action' => $event->action, 'changes' => $event->changes, 'created_at' => $event->created_at->toIso8601String()])->values()->all()),
        ]);
    }
}
