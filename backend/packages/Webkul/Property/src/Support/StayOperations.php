<?php

namespace Webkul\Property\Support;

use Carbon\CarbonImmutable;
use DateTimeImmutable;
use DateTimeInterface;

class StayOperations
{
    public const VIEWS = ['arrivals', 'departures', 'in_house', 'overdue'];

    public static function context(string $timezone, ?string $date, DateTimeInterface $instant): array
    {
        $clock = CarbonImmutable::instance($instant)->setTimezone($timezone);
        $today = $clock->format('Y-m-d');
        $selected = $date ?? $today;
        $parsed = DateTimeImmutable::createFromFormat('!Y-m-d', $selected);
        if (! $parsed || $parsed->format('Y-m-d') !== $selected) {
            throw new \InvalidArgumentException('Invalid operations date.');
        }

        return ['date' => $selected, 'today' => $today, 'timezone' => $timezone, 'as_of' => $clock->toIso8601String()];
    }
}
