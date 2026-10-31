<?php

namespace Webkul\Property\Http\Resources;

class LeadResource extends LeadSummaryResource
{
    public function toArray($request): array
    {
        return array_merge(parent::toArray($request), [
            'description' => $this->description, 'lost_reason' => $this->lost_reason,
            'contact' => $this->person ? ['id' => $this->person->id, 'name' => $this->person->name, 'emails' => $this->person->emails ?? [], 'contact_numbers' => $this->person->contact_numbers ?? []] : null,
        ]);
    }
}
