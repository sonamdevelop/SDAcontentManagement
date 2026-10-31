<?php

namespace Webkul\Property\Support;

use DateTimeInterface;

class SiteVisitState
{
    public const STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'];

    public static function validWindow(DateTimeInterface $start, DateTimeInterface $end, DateTimeInterface $now): bool
    {
        $duration = $end->getTimestamp() - $start->getTimestamp();

        return $start->getTimestamp() > $now->getTimestamp() && $duration > 0 && $duration <= 8 * 3600;
    }

    public static function allows(string $from, string $to, DateTimeInterface $start, DateTimeInterface $now): bool
    {
        if (! in_array($from, self::STATUSES, true) || ! in_array($to, self::STATUSES, true)) {
            return false;
        }
        if ($from === $to) {
            return true;
        }
        if ($from !== 'scheduled') {
            return false;
        }

        return $to === 'cancelled' || (in_array($to, ['completed', 'no_show'], true) && $now->getTimestamp() >= $start->getTimestamp());
    }

    public static function overlaps(DateTimeInterface $start, DateTimeInterface $end, DateTimeInterface $otherStart, DateTimeInterface $otherEnd): bool
    {
        return $start->getTimestamp() < $otherEnd->getTimestamp() && $end->getTimestamp() > $otherStart->getTimestamp();
    }
}
