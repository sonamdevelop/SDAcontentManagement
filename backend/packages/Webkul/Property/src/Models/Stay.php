<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;

class Stay extends Model implements \Webkul\Property\Contracts\Stay
{
    protected $table = 'stays';

    protected $fillable = ['name', 'city', 'timezone', 'active', 'description', 'rules', 'amenities', 'images', 'is_published', 'user_id'];

    protected $casts = ['amenities' => 'array', 'images' => 'array', 'is_published' => 'boolean', 'active' => 'boolean'];

    public function rooms()
    {
        return $this->hasMany(RoomType::class);
    }
}
