<?php

namespace Webkul\Property\Support;

use Carbon\CarbonImmutable;

/** Calendar-day bounds in the application's storage timezone. The upper bound is exclusive. */
class ReportPeriod
{
    public readonly ?CarbonImmutable $start;

    public readonly ?CarbonImmutable $endExclusive;

    public function __construct(public readonly ?string $from, public readonly ?string $to, public readonly string $timezone)
    {
        $this->start = $from === null ? null : CarbonImmutable::createFromFormat('!Y-m-d', $from, $timezone);
        $this->endExclusive = $to === null ? null : CarbonImmutable::createFromFormat('!Y-m-d', $to, $timezone)->addDay();
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
