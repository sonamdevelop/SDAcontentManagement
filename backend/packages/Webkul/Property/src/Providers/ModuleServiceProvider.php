<?php

namespace Webkul\Property\Providers;

use Webkul\Core\Providers\BaseModuleServiceProvider;
use Webkul\Property\Models\Enquiry;
use Webkul\Property\Models\Property;
use Webkul\Property\Models\SiteVisit;
use Webkul\Property\Models\SiteVisitEvent;

class ModuleServiceProvider extends BaseModuleServiceProvider
{
    protected $models = [Property::class, Enquiry::class, SiteVisit::class, SiteVisitEvent::class];
}
