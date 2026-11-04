<?php

namespace Webkul\Property\Support;

use Carbon\CarbonImmutable;

/** Requested calendar-day bounds converted to the storage timezone. The upper bound is exclusive. */
class ReportPeriod
{
    public readonly ?CarbonImmutable $start;

    public readonly ?CarbonImmutable $endExclusive;

    public function __construct(public readonly ?string $from, public readonly ?string $to, public readonly string $timezone, ?string $storageTimezone = null)
    {
        $storageTimezone ??= $timezone;
        $this->start = $from === null ? null : CarbonImmutable::createFromFormat('!Y-m-d', $from, $timezone)->setTimezone($storageTimezone);
        // Advance the calendar date before localizing, including midnight or whole-day skips.
        $nextDate = $to === null ? null : CarbonImmutable::createFromFormat('!Y-m-d', $to, 'UTC')->addDay()->format('Y-m-d');
        $this->endExclusive = $nextDate === null ? null : CarbonImmutable::createFromFormat('!Y-m-d', $nextDate, $timezone)->setTimezone($storageTimezone);
    }

    public function apply($query, string $column)
    {
        if ($this->start !== null) {
            $query->where($column, '>=', $this->start->format('Y-m-d H:i:s'));
        }
        if ($this->endExclusive !== null) {
            $query->where($column, '<', $this->endExclusive->format('Y-m-d H:i:s'));
        }

        return $query;
    }

    public function toArray(): array
    {
        return ['from' => $this->from, 'to' => $this->to, 'timezone' => $this->timezone];
    }
}
