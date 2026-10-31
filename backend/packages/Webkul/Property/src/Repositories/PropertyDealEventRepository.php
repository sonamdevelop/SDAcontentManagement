<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\PropertyDealEvent;

class PropertyDealEventRepository extends Repository
{
    public function model()
    {
        return PropertyDealEvent::class;
    }
}
