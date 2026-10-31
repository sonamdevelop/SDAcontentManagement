<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Webkul\Property\Contracts\SiteVisitEvent as EventContract;

class SiteVisitEvent extends Model implements EventContract
{
    protected $table = 'site_visit_events';

    protected $fillable = ['site_visit_id', 'actor_id', 'action', 'changes'];

    protected $casts = ['changes' => 'array'];
}
