<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PropertyDealFilters extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $time = ['nullable', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/'];

        return [
            'status' => 'nullable|in:reserved,confirmed,cancelled', 'property_id' => 'nullable|integer|min:1', 'lead_id' => 'nullable|integer|min:1',
            'user_id' => 'nullable|integer|min:1', 'purpose' => 'nullable|in:sale,rent',
            'from' => $time, 'to' => array_merge($time, [Rule::when($this->filled('from'), 'after_or_equal:from')]),
            'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100',
        ];
    }
}
