<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\StayBooking;

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

    public function request(string $id)
    {
        return $this->model->newQuery()->where('request_id', $id)->lockForUpdate()->first();
    }

    public function occupancy(int $room, string $in, string $out)
    {
        return $this->model->newQuery()->where('room_type_id', $room)->where('status', 'confirmed')->where('check_in', '<', $out)->where('check_out', '>', $in)->lockForUpdate()->get();
    }
}
