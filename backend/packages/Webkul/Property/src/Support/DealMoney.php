<?php

namespace Webkul\Property\Support;

class DealMoney
{
    public const PATTERN = '/^\d{1,13}(?:\.\d{1,2})?$/D';

    public static function cents(string $amount): int
    {
        if (! preg_match(self::PATTERN, $amount)) {
            throw new \InvalidArgumentException('Invalid decimal amount.');
        }
        $parts = explode('.', $amount);

        return ((int) $parts[0]) * 100 + (int) str_pad($parts[1] ?? '', 2, '0');
    }

    public static function normalize(string $amount): string
    {
        $cents = self::cents($amount);

        return intdiv($cents, 100).'.'.str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    public static function validAdvance(string $price, string $advance): bool
    {
        return self::cents($price) > 0 && self::cents($advance) <= self::cents($price);
    }
}
