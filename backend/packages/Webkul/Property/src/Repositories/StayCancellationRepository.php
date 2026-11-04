<?php

namespace Webkul\Property\Repositories;

use Illuminate\Support\Facades\DB;
use Webkul\Property\Support\StayCancellation;

class StayCancellationRepository
{
    public function query()
    {
        return DB::table('stay_cancellation_requests');
    }

    public function history(int $booking): array
    {
        return $this->query()->where('booking_id', $booking)->orderBy('id')->get()->map(fn ($row) => StayCancellation::view($row))->all();
    }

    public function request(string $key)
    {
        return $this->query()->where('request_id', $key)->lockForUpdate()->first();
    }

    public function locked(int $id)
    {
        return $this->query()->where('id', $id)->lockForUpdate()->first();
    }

    public function create(array $data)
    {
        $id = $this->query()->insertGetId($data + ['created_at' => now(), 'updated_at' => now()]);

        return $this->locked($id);
    }

    public function decide(int $id, string $status, string $reason, int $actor)
    {
        $this->query()->where('id', $id)->update(['status' => $status, 'decision_reason' => $reason, 'decided_by' => $actor, 'decided_at' => now(), 'updated_at' => now()]);

        return $this->locked($id);
    }

    public function queue($bookings, array $filters)
    {
        $q = $this->query()->joinSub($bookings->select(['id', 'stay_name', 'room_name', 'check_in', 'check_out', 'timezone']), 'booking', fn ($j) => $j->on('booking.id', '=', 'stay_cancellation_requests.booking_id'))->select(['stay_cancellation_requests.*', 'booking.stay_name', 'booking.room_name', 'booking.check_in', 'booking.check_out', 'booking.timezone']);
        if (isset($filters['booking_id'])) {
            $q->where('booking_id', $filters['booking_id']);
        }

        return $q->where('stay_cancellation_requests.status', $filters['status'] ?? 'pending')->orderByDesc('stay_cancellation_requests.id')->paginate($filters['per_page'] ?? 20);
    }
}
