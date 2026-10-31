<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SiteVisitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $time = ['required', 'date', 'regex:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/'];
        $schedule = ['starts_at' => $time, 'ends_at' => array_merge($time, ['after:starts_at'])];
        if ($this->routeIs('api.v1.admin.visits.schedule')) {
            return array_merge($schedule, ['reason' => 'required|string|max:1000']);
        }

        return array_merge($schedule, [
            'property_id' => 'required|integer|min:1', 'lead_id' => 'required|integer|min:1', 'user_id' => 'required|integer|min:1', 'notes' => 'nullable|string|max:5000',
        ]);
    }
}
