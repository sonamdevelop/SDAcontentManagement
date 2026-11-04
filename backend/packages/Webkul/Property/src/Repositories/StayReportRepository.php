<?php

namespace Webkul\Property\Repositories;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Support\ReportPeriod;
use Webkul\Property\Support\StayReport;

class StayReportRepository
{
    public function __construct(protected StayBookingRepository $bookings) {}

    public function report($stay, string $from, string $to): array
    {
        $roomIds = $stay->rooms()->select('id')->getQuery();
        $visible = $this->bookings->scopedQuery()->whereIn('room_type_id', $roomIds);
        $reserved = (clone $visible)->where('status', 'confirmed')->where('check_in', '<', $to)->where('check_out', '>', $from);
        $groups = (clone $reserved)->select(['check_in', 'check_out'])->selectRaw('SUM(rooms) AS rooms')->groupBy('check_in', 'check_out')->get()->toArray();
        $inventory = (int) $stay->rooms()->sum('inventory');
        $days = StayReport::days($groups, $from, $to, $inventory);
        // Nights are civil stay dates, independent of DST hours. Booking prices are snapshots.
        $values = (clone $reserved)->select('currency')->selectRaw('SUM(nightly_rate * rooms * DATEDIFF(LEAST(check_out, ?), GREATEST(check_in, ?))) AS booked_value', [$to, $from])->groupBy('currency')->orderBy('currency')->get();
        // Timestamp bounds are stay-local, with an exclusive calendar end, including skipped midnights.
        $last = CarbonImmutable::createFromFormat('!Y-m-d', $to, 'UTC')->subDay()->format('Y-m-d');
        $period = new ReportPeriod($from, $last, $stay->timezone, config('app.timezone'));
        $cash = DB::table('stay_payments as p')->leftJoin('stay_payments as original', 'original.id', '=', 'p.reversal_of')
            ->whereIn('p.booking_id', (clone $visible)->select('stay_bookings.id')->getQuery());
        $period->apply($cash, 'p.created_at');
        $cash->select('p.currency')
            ->selectRaw("SUM(CASE WHEN p.kind IN ('payment', 'opening_advance') THEN p.amount WHEN p.kind = 'reversal' AND original.kind IN ('payment', 'opening_advance') THEN -p.amount ELSE 0 END) AS receipts")
            ->selectRaw("SUM(CASE WHEN p.kind = 'refund' THEN p.amount WHEN p.kind = 'reversal' AND original.kind = 'refund' THEN -p.amount ELSE 0 END) AS refunds")
            ->groupBy('p.currency')->orderBy('p.currency');
        $cashRows = $cash->get()->map(fn ($r) => ['currency' => $r->currency, 'receipts' => StayReport::money((string) $r->receipts), 'refunds' => StayReport::money((string) $r->refunds)])->all();

        return [
            'context' => ['stay_id' => $stay->id, 'stay_name' => $stay->name, 'timezone' => $stay->timezone, 'from' => $from, 'to' => $to, 'as_of' => now()->toIso8601String(), 'inventory_basis' => 'current_all_room_types', 'booking_scope' => 'authorized_records'],
            'summary' => ['booked_room_nights' => array_sum(array_column($days, 'booked_rooms')), 'inventory_room_nights' => $inventory * count($days), 'confirmed_bookings' => (clone $reserved)->count()],
            'days' => $days,
            'booked_value' => $values->map(fn ($r) => ['currency' => $r->currency, 'amount' => StayReport::money((string) $r->booked_value)])->all(),
            'cash_movement' => $cashRows,
        ];
    }
}
