<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;
use Webkul\Property\Contracts\Property as PropertyContract;
use Webkul\User\Models\UserProxy;

class Property extends Model implements PropertyContract
{
    protected $table = 'properties';

    protected $fillable = ['title', 'description', 'purpose', 'property_type', 'price', 'rent_period', 'area', 'area_unit', 'bedrooms', 'bathrooms', 'address', 'city', 'state', 'postal_code', 'owner_name', 'owner_phone', 'status', 'user_id', 'images', 'accepts_enquiries', 'is_published'];

    protected $casts = ['price' => 'decimal:2', 'area' => 'decimal:2', 'bedrooms' => 'integer', 'bathrooms' => 'integer', 'images' => 'array', 'accepts_enquiries' => 'boolean', 'is_published' => 'boolean'];

    public function agent()
    {
        return $this->belongsTo(UserProxy::modelClass(), 'user_id');
    }
}
