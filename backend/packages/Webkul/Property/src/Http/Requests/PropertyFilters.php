<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PropertyFilters extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'q' => 'nullable|string|max:255', 'city' => 'nullable|string|max:100', 'purpose' => 'nullable|in:sale,rent', 'property_type' => 'nullable|in:apartment,house,villa,plot,commercial',
            'status' => ['nullable', Rule::in($this->routeIs('api.v1.admin.*') ? ['available', 'sold', 'rented', 'unavailable'] : ['available'])],
            'min_price' => 'nullable|numeric|min:0', 'max_price' => ['nullable', 'numeric', 'min:0', Rule::when($this->filled('min_price'), 'gte:min_price')],
            'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100',
        ];
    }
}
