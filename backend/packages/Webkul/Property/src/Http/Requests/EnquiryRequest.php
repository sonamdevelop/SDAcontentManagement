<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class EnquiryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'submission_id' => ['required', 'uuid'], 'name' => ['required', 'string', 'max:150', 'not_regex:/\{\{/'],
            'email' => ['required', 'string', 'email:rfc', 'max:255', 'not_regex:/\{\{/'], 'phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+() .-]{5,30}$/'],
            'message' => ['required', 'string', 'max:5000', 'not_regex:/\{\{/'], 'consent' => ['required', 'accepted'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => mb_strtolower(trim($this->input('email')))]);
        }
    }
}
