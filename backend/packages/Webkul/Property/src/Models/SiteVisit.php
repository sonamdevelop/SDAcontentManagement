<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Webkul\Property\Contracts\SiteVisit as SiteVisitContract;

class SiteVisit extends Model implements SiteVisitContract
{
    protected $table = 'site_visits';

    protected $fillable = ['property_id', 'lead_id', 'person_id', 'user_id', 'created_by', 'property_title', 'property_city', 'customer_name', 'customer_email', 'customer_phone', 'starts_at', 'ends_at', 'status', 'notes', 'feedback', 'cancellation_reason', 'completed_at', 'cancelled_at', 'no_show_at', 'reschedule_count', 'last_rescheduled_at', 'reschedule_reason'];

    protected $casts = ['starts_at' => 'datetime', 'ends_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime', 'no_show_at' => 'datetime', 'last_rescheduled_at' => 'datetime', 'reschedule_count' => 'integer'];

    public function events()
    {
        return $this->hasMany(SiteVisitEventProxy::modelClass(), 'site_visit_id')->orderBy('id');
    }
}
