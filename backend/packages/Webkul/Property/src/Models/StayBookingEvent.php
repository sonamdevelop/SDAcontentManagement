<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;

class StayBookingEvent extends Model implements \Webkul\Property\Contracts\StayBookingEvent
{
    protected $table = 'stay_booking_events';

    protected $fillable = ['booking_id', 'actor_id', 'action', 'changes'];

    protected $casts = ['changes' => 'array'];
}
