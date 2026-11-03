<?php

namespace Webkul\Property\Support;

class StayContent
{
    public static function remaining(array $existing, array $remove, int $uploads): array
    {
        if (array_diff($remove, $existing)) {
            throw new \InvalidArgumentException('invalid-image');
        }
        $remaining = array_values(array_diff($existing, $remove));
        if (count($remaining) + $uploads > 10) {
            throw new \InvalidArgumentException('image-limit');
        }

        return $remaining;
    }
}
