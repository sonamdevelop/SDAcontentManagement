<?php

namespace Webkul\Property\Support;

class PropertyStatus
{
    public static function allows(string $purpose, string $status): bool
    {
        return match ($purpose) {
            'sale' => in_array($status, ['available', 'sold', 'unavailable'], true),'rent' => in_array($status, ['available', 'rented', 'unavailable'], true),default => false
        };
    }
}
