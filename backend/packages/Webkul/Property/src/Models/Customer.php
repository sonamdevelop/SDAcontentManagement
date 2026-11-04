<?php

namespace Webkul\Property\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Authenticatable implements \Webkul\Property\Contracts\Customer
{
    use HasApiTokens;

    protected $table = 'stay_customers';

    protected $fillable = ['name', 'email', 'phone', 'password', 'active'];

    protected $hidden = ['password'];

    protected $casts = ['active' => 'boolean', 'email_verified_at' => 'datetime'];
}
