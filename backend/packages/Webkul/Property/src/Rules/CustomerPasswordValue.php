<?php

namespace Webkul\Property\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class CustomerPasswordValue implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        // Bcrypt must never silently truncate a password or receive a null byte.
        if (is_string($value) && (strlen($value) > 72 || str_contains($value, "\0"))) {
            $fail('admin::app.customer-api.password-format')->translate(['attribute' => str_replace('_', ' ', $attribute)]);
        }
    }
}
