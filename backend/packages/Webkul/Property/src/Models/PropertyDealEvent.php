<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Webkul\Property\Contracts\PropertyDealEvent as PropertyDealEventContract;

class PropertyDealEvent extends Model implements PropertyDealEventContract
{
    protected $table = 'property_deal_events';

    protected $fillable = ['deal_id', 'actor_id', 'action', 'changes'];

    protected $casts = ['changes' => 'array', 'actor_id' => 'integer'];
}
