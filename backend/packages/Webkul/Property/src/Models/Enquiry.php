<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Webkul\Lead\Models\LeadProxy;
use Webkul\Property\Contracts\Enquiry as EnquiryContract;

class Enquiry extends Model implements EnquiryContract
{
    protected $table = 'property_enquiries';

    protected $fillable = ['property_id', 'property_title', 'user_id', 'lead_id', 'submission_id', 'payload_hash', 'name', 'email', 'phone', 'message', 'consented_at'];

    protected $hidden = ['submission_id', 'payload_hash'];

    protected $casts = ['consented_at' => 'datetime'];

    public function lead()
    {
        return $this->belongsTo(LeadProxy::modelClass());
    }
}
