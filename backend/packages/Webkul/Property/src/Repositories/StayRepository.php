<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\Stay;
use Webkul\Property\Models\RoomType;

class StayRepository extends Repository
{
    public function model()
    {
        return Stay::class;
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

    public function publicQuery()
    {
        $visible = fn ($q) => $q->where('active', true)->where('is_published', true);

        return $this->model->newQuery()->where('active', true)->where('is_published', true)->whereHas('rooms', $visible)->withCount(['rooms' => $visible])->withMin(['rooms' => $visible], 'nightly_rate');
    }

    public function authorized(int $id, bool $lock = false)
    {
        $q = $this->scopedQuery();
        if ($lock) {
            $q->lockForUpdate();
        }

        return $q->findOrFail($id);
    }

    public function customerRoom(int $id, bool $lock = false, bool $published = true)
    {
        $parent = RoomType::query()->whereKey($id)->value('stay_id');
        abort_unless($parent, 404);
        $query = $this->model->newQuery();
        if ($lock) {
            $query->lockForUpdate();
        }
        $stay = $query->findOrFail($parent);
        $rooms = $stay->rooms();
        if ($lock) {
            $rooms->lockForUpdate();
        }
        $room = $rooms->findOrFail($id);
        abort_if($published && (! $stay->active || ! $stay->is_published || ! $room->active || ! $room->is_published), 404);
        $room->setRelation('stay', $stay);

        return $room;
    }

    public function room(int $id, bool $lock = false)
    {
        // All writes lock parent stay before room, including edits and cancellations.
        $parent = RoomType::query()->whereKey($id)->value('stay_id');
        abort_unless($parent, 404);
        $stay = $this->authorized($parent, $lock);
        $q = $stay->rooms();
        if ($lock) {
            $q->lockForUpdate();
        }
        $room = $q->findOrFail($id);
        $room->setRelation('stay', $stay);

        return $room;
    }
}
