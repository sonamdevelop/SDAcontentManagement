<?php

namespace Webkul\Property\Support;

use DateTimeImmutable;

class StayCalendar
{
    public static function days(array $bookings, string $from, string $to, int $inventory, bool $active, string $today): array
    {
        $nights = StayDates::nights($from, $to);
        if ($nights > 62) {
            throw new \InvalidArgumentException('Calendar range cannot exceed 62 nights.');
        }
        $events = [];
        foreach ($bookings as $booking) {
            if ($booking['check_in'] >= $to || $booking['check_out'] <= $from) {
                continue;
            }
            $start = max($from, $booking['check_in']);
            $end = min($to, $booking['check_out']);
            $events[$start] = ($events[$start] ?? 0) + (int) $booking['rooms'];
            $events[$end] = ($events[$end] ?? 0) - (int) $booking['rooms'];
        }
        $date = new DateTimeImmutable($from);
        $occupied = 0;
        $days = [];
        for ($i = 0; $i < $nights; $i++) {
            $key = $date->format('Y-m-d');
            $occupied += $events[$key] ?? 0;
            $available = $active ? max(0, $inventory - $occupied) : 0;
            $days[] = ['date' => $key, 'occupied_rooms' => $occupied, 'available_rooms' => $available, 'bookable' => $active && $key >= $today && $available > 0, 'over_capacity' => $occupied > $inventory];
            $date = $date->modify('+1 day');
        }

        return $days;
    }
}
