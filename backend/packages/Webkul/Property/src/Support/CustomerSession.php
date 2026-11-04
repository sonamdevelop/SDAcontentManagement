<?php

namespace Webkul\Property\Support;

use Carbon\CarbonImmutable;
use DateTimeInterface;

class CustomerSession
{
    public static function expiry($token, ?int $minutes): ?CarbonImmutable
    {
        $expiry = $token->expires_at ? CarbonImmutable::instance($token->expires_at) : null;
        $global = $minutes ? CarbonImmutable::instance($token->created_at)->addMinutes($minutes) : null;

        return $global && (! $expiry || $global->lt($expiry)) ? $global : $expiry;
    }

    public static function active($token, DateTimeInterface $asOf, ?int $minutes): bool
    {
        $expiry = self::expiry($token, $minutes);

        return $expiry === null || $expiry->gt($asOf);
    }

    public static function view($token, int $current, ?int $minutes): array
    {
        return ['id' => (int) $token->id, 'device_name' => $token->name, 'created_at' => $token->created_at->toIso8601String(), 'last_used_at' => $token->last_used_at?->toIso8601String(), 'expires_at' => self::expiry($token, $minutes)?->toIso8601String(), 'is_current' => (int) $token->id === $current];
    }
}
