<?php

namespace Webkul\Property\Support;

use DateTimeInterface;

class LeadStageState
{
    public static function changes(string $code, ?string $reason, ?DateTimeInterface $closedAt, DateTimeInterface $now): array
    {
        return [
            'closed_at' => in_array($code, ['won', 'lost'], true) ? ($closedAt ?? $now) : null,
            'lost_reason' => $code === 'lost' ? trim($reason ?? '') : null,
        ];
    }
}
