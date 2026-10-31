<?php

namespace Webkul\Property\Providers;

use Webkul\Core\Providers\BaseModuleServiceProvider;
use Webkul\Property\Models\Enquiry;
use Webkul\Property\Models\Property;

class ModuleServiceProvider extends BaseModuleServiceProvider
{
    protected $models = [Property::class, Enquiry::class];
}
