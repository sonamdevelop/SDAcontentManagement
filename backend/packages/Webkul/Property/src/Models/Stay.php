<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;

class Stay extends Model implements \Webkul\Property\Contracts\Stay
{
    protected $table = 'stays';

    protected $fillable = ['name', 'city', 'timezone', 'active', 'user_id'];

    protected $casts = ['active' => 'boolean'];

    public function rooms()
    {
        return $this->hasMany(RoomType::class);
    }
}
