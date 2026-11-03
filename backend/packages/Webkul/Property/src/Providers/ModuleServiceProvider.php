<?php

namespace Webkul\Property\Providers;

use Webkul\Core\Providers\BaseModuleServiceProvider;
use Webkul\Property\Models\Enquiry;
use Webkul\Property\Models\Property;
use Webkul\Property\Models\PropertyDeal;
use Webkul\Property\Models\PropertyDealEvent;
use Webkul\Property\Models\PropertyDocument;
use Webkul\Property\Models\RoomType;
use Webkul\Property\Models\SiteVisit;
use Webkul\Property\Models\SiteVisitEvent;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayBookingEvent;
use Webkul\Property\Models\StayPayment;

class ModuleServiceProvider extends BaseModuleServiceProvider
{
    protected $models = [StayPayment::class, Stay::class, RoomType::class, StayBooking::class, StayBookingEvent::class, Property::class, PropertyDeal::class, PropertyDealEvent::class, PropertyDocument::class, Enquiry::class, SiteVisit::class, SiteVisitEvent::class];
}
