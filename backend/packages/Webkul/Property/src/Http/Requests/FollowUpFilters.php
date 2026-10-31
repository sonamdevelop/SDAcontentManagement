<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FollowUpFilters extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => 'nullable|in:note,task', 'status' => 'nullable|in:pending,done', 'overdue' => 'nullable|boolean',
            'due_after' => ['nullable', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/'],
            'due_before' => ['nullable', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/', Rule::when($this->filled('due_after'), 'after_or_equal:due_after')],
            'page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100',
        ];
    }
}
