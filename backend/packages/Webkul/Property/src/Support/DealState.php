<?php

namespace Webkul\Property\Support;

class DealState
{
    public static function allows(string $from, string $to): bool
    {
        return in_array($from, ['reserved', 'confirmed', 'cancelled'], true)
            && ($from === $to || ($from === 'reserved' && in_array($to, ['confirmed', 'cancelled'], true)));
    }

    public static function propertyStatus(string $status, string $purpose): string
    {
        if (! in_array($purpose, ['sale', 'rent'], true)) {
            throw new \InvalidArgumentException('Invalid property purpose.');
        }

        return match ($status) {
            'reserved' => 'reserved', 'cancelled' => 'available', 'confirmed' => $purpose === 'sale' ? 'sold' : 'rented',
            default => throw new \InvalidArgumentException('Invalid deal status.'),
        };
    }
}
