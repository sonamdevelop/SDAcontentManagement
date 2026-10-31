<?php

namespace Webkul\Property\Repositories;

use Carbon\Carbon;
use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\PropertyDeal;

class PropertyDealRepository extends Repository
{
    public function model()
    {
        return PropertyDeal::class;
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

    public function activeForProperty(int $propertyId)
    {
        return $this->model->newQuery()->where('active_property_id', $propertyId)->lockForUpdate()->first();
    }

    public function listing(array $filters)
    {
        $query = $this->scopedQuery();
        foreach (['status', 'purpose', 'property_id', 'lead_id', 'user_id'] as $field) {
            if (isset($filters[$field])) {
                $query->where($field, $filters[$field]);
            }
        }
        foreach (['from' => '>=', 'to' => '<='] as $field => $op) {
            if (isset($filters[$field])) {
                $query->where('created_at', $op, Carbon::parse($filters[$field])->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s'));
            }
        }

        return $query->latest('id')->paginate($filters['per_page'] ?? 20)->withQueryString();
    }
}
