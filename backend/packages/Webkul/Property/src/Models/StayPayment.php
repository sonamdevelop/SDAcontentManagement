<?php

namespace Webkul\Property\Models;

use Illuminate\Database\Eloquent\Model;

class StayPayment extends Model implements \Webkul\Property\Contracts\StayPayment
{
    protected $table = 'stay_payments';

    protected $fillable = ['booking_id', 'request_id', 'payload_hash', 'kind', 'amount', 'currency', 'method', 'reference', 'reason', 'reversal_of', 'actor_id'];

    protected $casts = ['booking_id' => 'integer', 'reversal_of' => 'integer', 'actor_id' => 'integer', 'amount' => 'decimal:2'];

    protected $hidden = ['payload_hash'];

    public function reversal()
    {
        return $this->hasOne(self::class, 'reversal_of');
    }

    protected static function booted(): void
    {
        static::updating(static fn () => throw new \LogicException('Ledger entries are immutable.'));
        static::deleting(static fn () => throw new \LogicException('Ledger entries cannot be deleted.'));
    }
}
