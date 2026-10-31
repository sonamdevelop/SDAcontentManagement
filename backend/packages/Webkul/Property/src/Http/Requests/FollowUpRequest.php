<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class FollowUpRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $create = $this->isMethod('post');

        return [
            'type' => $create ? ['required', 'in:note,task'] : ['prohibited'],
            'title' => [$create ? 'required_if:type,task' : 'sometimes', 'string', 'max:255', 'not_regex:/\{\{/'],
            'comment' => [$create ? 'required_if:type,note' : 'sometimes', 'string', 'min:1', 'max:10000', 'not_regex:/\{\{/'],
            'due_at' => [$create ? 'required_if:type,task' : 'sometimes', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/'],
            'is_done' => ['sometimes', 'boolean'],
        ];
    }
}
