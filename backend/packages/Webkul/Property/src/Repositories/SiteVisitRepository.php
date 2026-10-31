<?php

namespace Webkul\Property\Repositories;

use Carbon\Carbon;
use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\SiteVisit;

class SiteVisitRepository extends Repository
{
    public function model()
    {
        return SiteVisit::class;
    }

    public function scopedQuery()
    {
        $query = $this->model->newQuery();
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $query->whereIn('user_id', $ids);
        }

return $query;
    }

    public function authorized(int $id, bool $lock = false)
    {
        $query = $this->scopedQuery();
        if ($lock) {
            $query->lockForUpdate();
        }

return $query->findOrFail($id);
    }

    public function listing(array $filters)
    {
        $query = $this->scopedQuery();
        foreach (['property_id', 'lead_id', 'user_id', 'status'] as $field) {
            if (isset($filters[$field])) {
                $query->where($field, $filters[$field]);
            }
        }
        foreach (['from' => '>=', 'to' => '<='] as $field => $op) {
            if (isset($filters[$field])) {
                $query->where('starts_at', $op, Carbon::parse($filters[$field])->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s'));
            }
        }

        return $query->orderBy('starts_at')->orderBy('id')->paginate($filters['per_page'] ?? 20)->withQueryString();
    }
}
