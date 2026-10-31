<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Support\FollowUpState;

class FollowUpResource extends JsonResource
{
    public function toArray($request): array
    {
        $additional = is_array($this->additional) ? $this->additional : json_decode($this->additional ?? '{}', true);
        $comment = $this->comment ?? '';
        if (! ($additional['api_plain_text'] ?? false)) {
            $comment = strip_tags($comment);
        }

        return [
            'id' => $this->id, 'lead_ids' => $this->resource->getRelation('apiLeadIds')->all(),
            'type' => $this->type, 'title' => $this->title,
            'comment' => html_entity_decode($comment, ENT_QUOTES | ENT_HTML5, 'UTF-8'),
            'due_at' => $this->schedule_to?->toIso8601String(), 'is_done' => (bool) $this->is_done,
            'status' => $this->is_done ? 'done' : 'pending',
            'is_overdue' => FollowUpState::overdue($this->type, (bool) $this->is_done, $this->schedule_to, now()),
            'user_id' => $this->user_id, 'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
