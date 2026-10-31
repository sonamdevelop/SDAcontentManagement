<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Webkul\Property\Support\DocumentFilePolicy;

class PropertyDocumentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => 'required|string|max:150',
            'category' => ['required', Rule::in(DocumentFilePolicy::CATEGORIES)],
            'description' => 'nullable|string|max:1000',
            'file' => ['required', 'file', 'max:'.DocumentFilePolicy::MAX_KB, 'mimetypes:'.implode(',', array_keys(DocumentFilePolicy::TYPES)), 'extensions:pdf,jpg,jpeg,png'],
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if (! $validator->errors()->has('file')) {
                $file = $this->file('file');
                if (! DocumentFilePolicy::allows(DocumentFilePolicy::detectedMime($file->getRealPath()), $file->getClientOriginalName())) {
                    $validator->errors()->add('file', trans('admin::app.property-api.document-type'));
                }
            }
        }];
    }
}
