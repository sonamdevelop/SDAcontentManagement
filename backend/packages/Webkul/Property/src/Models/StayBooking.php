<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;

class StayBooking extends Model implements \Webkul\Property\Contracts\StayBooking
{
    protected $table = 'stay_bookings';

    protected $fillable = ['request_id', 'payload_hash', 'room_type_id', 'user_id', 'created_by', 'stay_name', 'room_name', 'timezone', 'check_in', 'check_out', 'rooms', 'guests', 'guest_name', 'guest_email', 'guest_phone', 'nightly_rate', 'total', 'advance', 'currency', 'payment_reference', 'notes', 'status', 'cancelled_at', 'cancellation_reason'];

    protected $casts = ['customer_id' => 'integer', 'rooms' => 'integer', 'guests' => 'integer', 'nightly_rate' => 'decimal:2', 'total' => 'decimal:2', 'advance' => 'decimal:2', 'checked_in_at' => 'datetime', 'checked_out_at' => 'datetime', 'cancelled_at' => 'datetime'];

    public function events()
    {
        return $this->hasMany(StayBookingEvent::class, 'booking_id')->orderBy('id');
    }
}
