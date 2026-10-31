<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class AgentOptionResource extends JsonResource
{
    public function toArray($request): array
    {
        return ['id' => $this->id, 'name' => $this->name];
    }
}
