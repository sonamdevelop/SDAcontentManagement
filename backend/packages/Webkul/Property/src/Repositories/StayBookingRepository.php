<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\StayBooking;
use Webkul\Property\Models\RoomType;

class StayBookingRepository extends Repository
{
    public function model()
    {
        return StayBooking::class;
    }

    public function scopedQuery()
    {
        $q = $this->model->newQuery();
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $q->whereIn('user_id', $ids);
        }

        return $q;
    }

    public function authorized(int $id, bool $lock = false)
    {
        $q = $this->scopedQuery();
        if ($lock) {
            $q->lockForUpdate();
        }

        return $q->findOrFail($id);
    }

    public function createForCustomer(array $data, int $customerId)
    {
        $booking = $this->model->newInstance();
        $booking->fill($data);
        $booking->forceFill(['customer_id' => $customerId])->save();

        return $booking;
    }

    public function forCustomer(int $id)
    {
        return $this->model->newQuery()->where('customer_id', $id);
    }

    public function filteredQuery(array $filters)
    {
        $query = $this->scopedQuery();
        foreach (['booking_id' => 'id', 'room_type_id' => 'room_type_id', 'status' => 'status'] as $filter => $column) {
            if (isset($filters[$filter])) {
                $query->where($column, $filters[$filter]);
            }
        }
        if (isset($filters['stay_id'])) {
            $query->whereIn('room_type_id', RoomType::query()->select('id')->where('stay_id', $filters['stay_id']));
        }
        foreach (['arrival_from' => '>=', 'arrival_to' => '<='] as $filter => $operator) {
            if (isset($filters[$filter])) {
                $query->where('check_in', $operator, $filters[$filter]);
            }
        }
        if (isset($filters['attendance_status'])) {
            match ($filters['attendance_status']) {
                'not_arrived' => $query->whereNull('checked_in_at')->whereNull('checked_out_at'),
                'checked_in' => $query->whereNotNull('checked_in_at')->whereNull('checked_out_at'),
                'checked_out' => $query->whereNotNull('checked_out_at'),
            };
        }

        return $query;
    }

    public function operationsBase($stay)
    {
        return $this->scopedQuery()->select(['id', 'room_type_id', 'room_name', 'guest_name', 'check_in', 'check_out', 'rooms', 'guests', 'checked_in_at', 'checked_out_at'])->where('status', 'confirmed')->whereIn('room_type_id', $stay->rooms()->select('id')->getQuery());
    }

    public function operationsQueue($base, string $view, string $date, string $today)
    {
        $query = clone $base;

        return match ($view) {
            'arrivals' => $query->where('check_in', $date),
            'departures' => $query->where('check_out', $date),
            'in_house' => $query->whereNotNull('checked_in_at')->whereNull('checked_out_at'),
            'overdue' => $query->whereNotNull('checked_in_at')->whereNull('checked_out_at')->where('check_out', '<', $today),
            default => throw new \InvalidArgumentException('Invalid operations queue.'),
        };
    }

    public function paymentFollowUps($stay, string $view, $totals)
    {
        // Keep booking visibility independent of stay visibility; never join staff identities.
        $base = $this->scopedQuery()->whereIn('room_type_id', $stay->rooms()->select('id')->getQuery())
            ->leftJoinSub($totals, 'ledger', 'ledger.booking_id', '=', 'stay_bookings.id');
        $due = "CASE WHEN stay_bookings.status = 'cancelled' THEN 0 ELSE stay_bookings.total END";
        $net = 'COALESCE(ledger.net_paid, 0)';
        $base->select(['stay_bookings.id', 'room_type_id', 'room_name', 'guest_name', 'check_in', 'check_out', 'status', 'currency'])
            ->selectRaw("$net AS net_paid, $due AS amount_due")
            ->selectRaw("GREATEST(0, $due - $net) AS balance, GREATEST(0, $net - $due) AS refund_due");

        return match ($view) {
            'collection' => $base->whereRaw("$due > $net"),
            'refund' => $base->whereRaw("$net > $due"),
            default => throw new \InvalidArgumentException('Invalid payment queue.'),
        };
    }

    public function request(string $id)
    {
        return $this->model->newQuery()->where('request_id', $id)->lockForUpdate()->first();
    }

    public function occupancy(int $room, string $in, string $out)
    {
        return $this->model->newQuery()->where('room_type_id', $room)->where('status', 'confirmed')->where('check_in', '<', $out)->where('check_out', '>', $in)->lockForUpdate()->get();
    }
}
