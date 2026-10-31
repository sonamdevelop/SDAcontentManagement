<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReportFilters extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:1000-01-01', 'before_or_equal:9998-12-31'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:1000-01-01', 'before_or_equal:9998-12-31', Rule::when($this->filled('from'), 'after_or_equal:from')],
            'user_id' => 'nullable|integer|min:1',
            'page' => 'nullable|integer|min:1',
            'per_page' => 'nullable|integer|between:1,100',
        ];
    }
}
