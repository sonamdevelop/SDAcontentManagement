<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\SiteVisitEvent;

class SiteVisitEventRepository extends Repository
{
    public function model()
    {
        return SiteVisitEvent::class;
    }
}
