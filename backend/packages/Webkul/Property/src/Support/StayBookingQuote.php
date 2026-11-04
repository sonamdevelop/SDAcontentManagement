<?php

namespace Webkul\Property\Support;

class StayBookingQuote
{
    public static function cents(string $rate, string $expected, int $rooms, int $guests, int $capacity, int $nights): int
    {
        if ($rooms < 1 || $rooms > 1000 || $guests < 1 || $guests > 10000 || $nights < 1 || $nights > 365 || $capacity < 1 || $capacity > 100) {
            throw new \InvalidArgumentException('amount-limit');
        }
        if ($guests > $rooms * $capacity) {
            throw new \InvalidArgumentException('capacity');
        }
        if (DealMoney::normalize($expected) !== DealMoney::normalize($rate)) {
            throw new \InvalidArgumentException('rate-changed');
        }
        $cents = DealMoney::cents($rate);
        if ($cents === 0) {
            throw new \InvalidArgumentException('positive');
        }
        $factor = $rooms * $nights;
        if ($cents > intdiv(999999999999999, $factor)) {
            throw new \InvalidArgumentException('amount-limit');
        }

        return $cents * $factor;
    }
}
