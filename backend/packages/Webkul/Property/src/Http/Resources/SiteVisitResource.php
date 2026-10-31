<?php

namespace Webkul\Property\Http\Resources;

class SiteVisitResource extends SiteVisitSummaryResource
{
    public function toArray($request): array
    {
        return array_merge(parent::toArray($request), [
            'person_id' => $this->person_id, 'created_by' => $this->created_by, 'customer_email' => $this->customer_email, 'customer_phone' => $this->customer_phone,
            'notes' => $this->notes, 'feedback' => $this->feedback, 'cancellation_reason' => $this->cancellation_reason,
            'completed_at' => $this->completed_at?->toIso8601String(), 'cancelled_at' => $this->cancelled_at?->toIso8601String(), 'no_show_at' => $this->no_show_at?->toIso8601String(),
            'last_rescheduled_at' => $this->last_rescheduled_at?->toIso8601String(), 'reschedule_reason' => $this->reschedule_reason,
            'events' => $this->whenLoaded('events', fn () => $this->events->map(fn ($event) => ['id' => $event->id, 'actor_id' => $event->actor_id, 'action' => $event->action, 'changes' => $event->changes, 'created_at' => $event->created_at->toIso8601String()])->values()->all()),
        ]);
    }
}
