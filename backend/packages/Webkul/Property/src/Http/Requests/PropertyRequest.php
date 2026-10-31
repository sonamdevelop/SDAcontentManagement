<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Webkul\Property\Support\PropertyStatus;

class PropertyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return auth()->guard('user')->check();
    }

    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'], 'description' => ['nullable', 'string', 'max:10000'],
            'purpose' => ['required', Rule::in(['sale', 'rent'])], 'property_type' => ['required', Rule::in(['apartment', 'house', 'villa', 'plot', 'commercial'])],
            'price' => ['required', 'numeric', 'min:0', 'max:9999999999999.99', 'decimal:0,2'],
            'rent_period' => ['exclude_unless:purpose,rent', 'required', Rule::in(['monthly', 'yearly', 'daily'])],
            'area' => ['required', 'numeric', 'gt:0', 'max:9999999999.99', 'decimal:0,2'], 'area_unit' => ['required', Rule::in(['sqft', 'sqm', 'acre'])],
            'bedrooms' => ['nullable', 'integer', 'between:0,100'], 'bathrooms' => ['nullable', 'integer', 'between:0,100'],
            'address' => ['required', 'string', 'max:500'], 'city' => ['required', 'string', 'max:100'], 'state' => ['required', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'], 'owner_name' => ['required', 'string', 'max:255'], 'owner_phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+() .-]+$/'],
            'status' => ['required', Rule::in(['available', 'reserved', 'sold', 'rented', 'unavailable'])],
            'accepts_enquiries' => ['sometimes', 'boolean'], 'is_published' => ['sometimes', 'boolean'],
            'photos' => ['nullable', 'array', 'max:10'], 'photos.*' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'remove_images' => ['nullable', 'array', 'max:10'], 'remove_images.*' => ['required', 'string', 'max:255'],
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if (! $validator->errors()->has('purpose') && ! $validator->errors()->has('status') && ! PropertyStatus::allows($this->input('purpose'), $this->input('status'))) {
                $validator->errors()->add('status', trans('admin::app.property-api.invalid-status'));
            }
        }];
    }
}
