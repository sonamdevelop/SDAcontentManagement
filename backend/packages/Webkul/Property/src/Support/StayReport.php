<?php

namespace Webkul\Property\Support;

use DateTimeImmutable;

class StayReport
{
    /** Occupancy is scoped confirmed reservations, compared with current inventory. */
    public static function days(iterable $bookings, string $from, string $to, int $inventory): array
    {
        $nights = StayDates::nights($from, $to);
        if ($nights > 62) {
            throw new \InvalidArgumentException('Reports support at most 62 nights.');
        }
        $date = new DateTimeImmutable($from, new \DateTimeZone('UTC'));
        $rows = is_array($bookings) ? $bookings : iterator_to_array($bookings);
        $days = [];
        for ($i = 0; $i < $nights; $i++) {
            $key = $date->format('Y-m-d');
            $occupied = 0;
            foreach ($rows as $b) {
                if ($b['check_in'] <= $key && $b['check_out'] > $key) {
                    $occupied += (int) $b['rooms'];
                }
            }
            $days[] = ['date' => $key, 'booked_rooms' => $occupied, 'inventory_rooms' => $inventory, 'over_capacity' => $occupied > $inventory];
            $date = $date->modify('+1 day');
        }

        return $days;
    }

    /** Normalize exact SQL decimals without converting money to floating point. */
    public static function money(string $amount): string
    {
        if (! preg_match('/^(-?)([0-9]+)(?:\.([0-9]{1,2}))?$/D', $amount, $m)) {
            throw new \UnexpectedValueException('Invalid report money.');
        }
        $whole = ltrim($m[2], '0') ?: '0';
        $fraction = str_pad($m[3] ?? '', 2, '0');

        return (($whole !== '0' || $fraction !== '00') ? $m[1] : '').$whole.'.'.$fraction;
    }
}
