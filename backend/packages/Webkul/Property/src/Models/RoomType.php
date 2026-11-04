<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;

class RoomType extends Model implements \Webkul\Property\Contracts\RoomType
{
    protected $table = 'stay_room_types';

    protected $fillable = ['stay_id', 'name', 'inventory', 'capacity', 'nightly_rate', 'active', 'description', 'rules', 'amenities', 'images', 'is_published'];

    protected $casts = ['amenities' => 'array', 'images' => 'array', 'is_published' => 'boolean', 'inventory' => 'integer', 'capacity' => 'integer', 'nightly_rate' => 'decimal:2', 'active' => 'boolean'];

    public function stay()
    {
        return $this->belongsTo(Stay::class);
    }
}
