<?php

namespace Webkul\Property\Support;

use Illuminate\Support\Carbon;

class StayCancellation
{
    public static function eligible(string $status, bool $arrived, string $arrival, string $today): bool
    {
        return $status === 'confirmed' && ! $arrived && $arrival > $today;
    }

    public static function view(object $r): array
    {
        return ['id' => (int) $r->id, 'booking_id' => (int) $r->booking_id, 'status' => $r->status, 'reason' => $r->reason, 'decision_reason' => $r->decision_reason, 'created_at' => Carbon::parse($r->created_at)->toIso8601String(), 'decided_at' => $r->decided_at ? Carbon::parse($r->decided_at)->toIso8601String() : null];
    }
}
