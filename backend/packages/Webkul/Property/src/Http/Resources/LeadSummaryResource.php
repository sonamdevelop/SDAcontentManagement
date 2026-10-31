<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class LeadSummaryResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'title' => $this->title, 'lead_value' => (string) $this->lead_value,
            'currency' => config('app.currency'), 'user_id' => $this->user_id,
            'agent' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name] : null,
            'pipeline' => $this->pipeline ? ['id' => $this->pipeline->id, 'name' => $this->pipeline->name] : null,
            'stage' => $this->stage ? ['id' => $this->stage->id, 'name' => $this->stage->name, 'code' => $this->stage->code] : null,
            'closed_at' => $this->closed_at?->toIso8601String(), 'expected_close_date' => $this->expected_close_date?->format('Y-m-d'),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
