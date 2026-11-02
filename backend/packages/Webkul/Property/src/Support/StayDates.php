<?php

namespace Webkul\Property\Support;

use DateTimeImmutable;

class StayDates
{
    public static function nights(string $in, string $out): int
    {
        $a = DateTimeImmutable::createFromFormat('!Y-m-d', $in);
        $b = DateTimeImmutable::createFromFormat('!Y-m-d', $out);
        if (! $a || ! $b || $a->format('Y-m-d') !== $in || $b->format('Y-m-d') !== $out) {
            throw new \InvalidArgumentException('Invalid stay dates.');
        }
        $n = (int) $a->diff($b)->format('%r%a');
        if ($n < 1 || $n > 365) {
            throw new \InvalidArgumentException('Stay must be 1–365 nights.');
        }

        return $n;
    }

    public static function amount(int $cents): string
    {
        return intdiv($cents, 100).'.'.str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    // Peak concurrent occupancy, not the sum of all bookings overlapping a multi-night window.
    public static function peak(array $bookings, string $in, string $out): int
    {
        $events = [];
        foreach ($bookings as $b) {
            if ($b['check_in'] >= $out || $b['check_out'] <= $in) {
                continue;
            }
            $a = max($in, $b['check_in']);
            $z = min($out, $b['check_out']);
            $events[$a] = ($events[$a] ?? 0) + (int) $b['rooms'];
            $events[$z] = ($events[$z] ?? 0) - (int) $b['rooms'];
        }
        ksort($events);
        $used = 0;
        $peak = 0;
        foreach ($events as $delta) {
            $used += $delta;
            $peak = max($peak, $used);
        }

return $peak;
    }
}
