<?php

namespace Webkul\Property\Support;

use DateTimeInterface;

class FollowUpState
{
    public static function overdue(string $type, bool $done, ?DateTimeInterface $due, DateTimeInterface $now): bool
    {
        return $type === 'task' && ! $done && $due !== null && $due->getTimestamp() < $now->getTimestamp();
    }
}
