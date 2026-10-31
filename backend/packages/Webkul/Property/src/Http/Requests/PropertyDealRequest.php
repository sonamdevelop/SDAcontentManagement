<?php

namespace Webkul\Property\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Webkul\Property\Support\DealMoney;

class PropertyDealRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'request_id' => 'required|uuid', 'property_id' => 'required|integer|min:1', 'lead_id' => 'required|integer|min:1',
            'agreed_price' => ['required', 'string', 'regex:'.DealMoney::PATTERN],
            'booking_amount' => ['sometimes', 'required', 'string', 'regex:'.DealMoney::PATTERN],
            'payment_reference' => 'nullable|string|max:190', 'notes' => 'nullable|string|max:5000',
        ];
    }

    public function after(): array
    {
        return [function ($validator) {
            if (! $validator->errors()->has('agreed_price') && ! $validator->errors()->has('booking_amount')
                && ! DealMoney::validAdvance($this->input('agreed_price'), $this->input('booking_amount', '0.00'))) {
                $validator->errors()->add(DealMoney::cents($this->input('agreed_price')) === 0 ? 'agreed_price' : 'booking_amount', trans('admin::app.property-api.deal-money'));
            }
        }];
    }
}
