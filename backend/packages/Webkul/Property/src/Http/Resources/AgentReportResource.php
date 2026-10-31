<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class AgentReportResource extends JsonResource
{
    public function toArray($request): array
    {
        $attributes = $this->resource->getAttributes();
        $metrics = function (string $prefix, array $fields) use ($attributes) {
            if (! array_key_exists($prefix.'_total', $attributes)) {
                return null;
            }

            return array_combine($fields, array_map(fn ($field) => (int) $attributes[$prefix.'_'.$field], $fields));
        };

        return [
            'user_id' => (int) $this->id, 'name' => $this->name, 'active' => (bool) $this->status,
            'leads' => $metrics('leads', ['total', 'open', 'won', 'lost', 'unclassified']),
            'site_visits' => $metrics('visits', ['total', 'scheduled', 'completed', 'cancelled', 'no_show', 'upcoming']),
        ];
    }
}
