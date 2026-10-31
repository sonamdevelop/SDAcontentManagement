<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Webkul\Property\Contracts\PropertyDeal as PropertyDealContract;

class PropertyDeal extends Model implements PropertyDealContract
{
    protected $table = 'property_deals';

    protected $fillable = ['request_id', 'payload_hash', 'property_id', 'active_property_id', 'lead_id', 'person_id', 'user_id', 'created_by', 'property_title', 'property_city', 'purpose', 'rent_period', 'customer_name', 'customer_email', 'customer_phone', 'currency', 'agreed_price', 'booking_amount', 'payment_reference', 'notes', 'status', 'confirmed_at', 'cancelled_at', 'cancellation_reason'];

    protected $hidden = ['payload_hash', 'active_property_id'];

    protected $casts = ['active_property_id' => 'integer', 'property_id' => 'integer', 'lead_id' => 'integer', 'person_id' => 'integer', 'user_id' => 'integer', 'created_by' => 'integer', 'agreed_price' => 'decimal:2', 'booking_amount' => 'decimal:2', 'confirmed_at' => 'datetime', 'cancelled_at' => 'datetime'];

    public function events()
    {
        return $this->hasMany(PropertyDealEventProxy::modelClass(), 'deal_id')->orderBy('id');
    }
}
