<?php

namespace Webkul\Property\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class PropertyDocumentResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'property_id' => $this->property_id, 'title' => $this->title,
            'category' => $this->category, 'description' => $this->description,
            'original_name' => $this->original_name, 'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes, 'sha256' => $this->sha256, 'uploaded_by' => $this->uploaded_by,
            'created_at' => $this->created_at?->toIso8601String(),
            'download_url' => route('api.v1.admin.properties.documents.download', ['propertyId' => $this->property_id, 'id' => $this->id], false),
        ];
    }
}
