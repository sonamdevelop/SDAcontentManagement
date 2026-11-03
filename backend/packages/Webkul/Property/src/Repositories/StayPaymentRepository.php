<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\StayPayment;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\StayLedger;

class StayPaymentRepository extends Repository
{
    public function model()
    {
        return StayPayment::class;
    }

    public function entries(int $id, bool $lock = false)
    {
        $q = $this->model->newQuery()->where('booking_id', $id)->orderBy('id');
        if ($lock) {
            $q->lockForUpdate();
        }

return $q->get();
    }

    public function request(string $id)
    {
        return $this->model->newQuery()->where('request_id', $id)->lockForUpdate()->first();
    }

    public function summary($booking, bool $lock = false)
    {
        return StayLedger::totals($this->entries($booking->id, $lock)->toArray(), $booking->total, $booking->status);
    }

    public function prime($bookings): void
    {
        $groups = $this->model->newQuery()->whereIn('booking_id', $bookings->modelKeys())->get()->groupBy('booking_id');
        foreach ($bookings as $booking) {
            $booking->setAttribute('ledger_snapshot', StayLedger::totals(($groups[$booking->id] ?? collect())->toArray(), $booking->total, $booking->status));
        }
    }

    public function page(int $id, int $perPage)
    {
        return $this->model->newQuery()->where('booking_id', $id)->with('reversal')->orderByDesc('id')->paginate($perPage)->withQueryString();
    }

    public function opening($booking): void
    {
        if (DealMoney::cents($booking->advance) === 0) {
            return;
        }
        $this->create(['booking_id' => $booking->id, 'request_id' => $booking->request_id, 'payload_hash' => hash('sha256', 'opening:'.$booking->request_id), 'kind' => 'opening_advance', 'amount' => $booking->advance, 'currency' => $booking->currency, 'method' => 'unspecified', 'reference' => $booking->payment_reference, 'reason' => null, 'reversal_of' => null, 'actor_id' => $booking->created_by]);
    }
}
