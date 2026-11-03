<?php

namespace Webkul\Property\Support;

class StayAttendance
{
    public static function status(bool $arrived, bool $departed): string
    {
        return $departed ? 'checked_out' : ($arrived ? 'checked_in' : 'not_arrived');
    }

    public static function canArrive(string $status, string $in, string $out, string $today): bool
    {
        return $status === 'confirmed' && $in <= $today && $today < $out;
    }
}
