<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class LeadFilters extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'q' => 'nullable|string|max:255', 'lead_pipeline_id' => 'nullable|integer|min:1', 'lead_pipeline_stage_id' => 'nullable|integer|min:1',
            'user_id' => 'nullable|integer|min:1', 'property_id' => 'nullable|integer|min:1', 'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100',
        ];
    }
}
