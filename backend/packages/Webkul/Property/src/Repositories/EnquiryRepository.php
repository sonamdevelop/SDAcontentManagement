<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\Enquiry;

class EnquiryRepository extends Repository
{
    public function model()
    {
        return Enquiry::class;
    }

    public function listing(?array $ids, ?int $propertyId, int $perPage = 20)
    {
        $q = $this->model->newQuery();
        if ($ids !== null) {
            $q->whereIn('user_id', $ids);
        }if ($propertyId !== null) {
            $q->where('property_id', $propertyId);
        }

        return $q->latest('id')->paginate($perPage)->withQueryString();
    }
}
