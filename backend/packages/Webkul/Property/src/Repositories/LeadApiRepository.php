<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Lead\Contracts\Lead;

class LeadApiRepository extends Repository
{
    public function model()
    {
        return Lead::class;
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
        $query = $this->scopedQuery()->with(['user', 'pipeline', 'stage', 'person']);
        if (! empty($filters['q'])) {
            $query->where('title', 'like', '%'.$filters['q'].'%');
        }
        foreach (['user_id', 'lead_pipeline_id', 'lead_pipeline_stage_id'] as $field) {
            if (isset($filters[$field])) {
                $query->where($field, $filters[$field]);
            }
        }
        if (isset($filters['property_id'])) {
            $ids = app(EnquiryRepository::class)->getModel()->newQuery()->where('property_id', $filters['property_id'])->select('lead_id');
            $query->whereIn('id', $ids);
        }

        return $query->latest('id')->paginate($filters['per_page'] ?? 20)->withQueryString();
    }
}
