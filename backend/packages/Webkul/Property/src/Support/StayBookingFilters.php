<?php

namespace Webkul\Property\Support;

use Illuminate\Support\Facades\Validator;

class StayBookingFilters
{
    public static function validate(array $input): array
    {
        $rules = ['booking_id' => 'sometimes|integer|min:1', 'arrival_from' => 'sometimes|date_format:Y-m-d', 'arrival_to' => 'sometimes|date_format:Y-m-d'];
        if (isset($input['arrival_from'])) {
            $rules['arrival_to'] .= '|after_or_equal:arrival_from';
        }

        return Validator::make($input, $rules)->validate();
    }
}
