<?php

namespace Webkul\Property\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayCancellationRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\StayCancellation;

class StayCancellationService
{
    public function __construct(protected StayBookingRepository $bookings, protected StayRepository $stays, protected StayCancellationRepository $requests) {}

    private function replay($r, int $customer, string $hash)
    {
        abort_unless((int) $r->customer_id === $customer && hash_equals($r->payload_hash, $hash), 409);

        return $r;
    }

    public function request(int $customer, int $booking, array $data): array
    {
        $key = strtolower($data['request_id']);
        $reason = trim($data['reason']);
        $hash = hash('sha256', json_encode([$customer, $booking, $reason], JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($customer, $booking, $key, $reason, $hash) {
                $initial = $this->bookings->forCustomer($customer)->findOrFail($booking);
                $this->stays->customerRoom($initial->room_type_id, true, false);
                $record = $this->bookings->forCustomer($customer)->lockForUpdate()->findOrFail($booking);
                $old = $this->requests->request($key);
                if ($old) {
                    return [$this->replay($old, $customer, $hash), false];
                }
                if (! StayCancellation::eligible($record->status, $record->checked_in_at !== null, $record->check_in, now($record->timezone)->format('Y-m-d'))) {
                    throw ValidationException::withMessages(['status' => trans('admin::app.stay-api.started')]);
                }
                abort_if($this->requests->query()->where('booking_id', $booking)->where('status', 'pending')->exists(), 409);
                $r = $this->requests->create(['booking_id' => $booking, 'customer_id' => $customer, 'request_id' => $key, 'payload_hash' => $hash, 'reason' => $reason, 'status' => 'pending']);
                $record->events()->create(['actor_id' => null, 'customer_actor_id' => $customer, 'action' => 'cancellation_requested', 'changes' => ['cancellation_request_id' => (int) $r->id, 'reason' => $reason]]);

                return [$r, true];
            }, 3);
        } catch (QueryException $e) {
            $old = $this->requests->request($key);
            if (! $old) {
                throw $e;
            }

return [$this->replay($old, $customer, $hash), false];
        }
    }

    public function decision(int $id, string $decision, string $reason)
    {
        return DB::transaction(function () use ($id, $decision, $reason) {
            $initial = $this->requests->query()->where('id', $id)->first();
            abort_unless($initial, 404);
            $b = $this->bookings->authorized($initial->booking_id);
            $this->stays->room($b->room_type_id, true);
            $b = $this->bookings->authorized($b->id, true);
            $r = $this->requests->locked($id);
            $target = $decision === 'approve' ? 'approved' : 'rejected';
            $reason = trim($reason);
            if ($r->status !== 'pending') {
                abort_unless($r->status === $target && $r->decision_reason === $reason, 409);

                return $r;
            }
            if ($decision === 'approve') {
                app(StayBookingService::class)->cancel($b->id, $reason, $id);
            }
            $r = $this->requests->decide($id, $target, $reason, auth()->guard('user')->id());
            $b->events()->create(['actor_id' => auth()->guard('user')->id(), 'action' => 'cancellation_'.$target, 'changes' => ['cancellation_request_id' => $id, 'decision_reason' => $reason]]);

            return $r;
        }, 3);
    }

    public function closePending($booking, string $reason, ?int $except = null): void
    {
        if ($booking->customer_id === null) {
            return;
        }
        $q = $this->requests->query()->where('booking_id', $booking->id)->where('status', 'pending');
        if ($except !== null) {
            $q->where('id', '!=', $except);
        }
        foreach ($q->lockForUpdate()->get() as $r) {
            $this->requests->decide($r->id, 'closed', $reason, auth()->guard('user')->id());
            $booking->events()->create(['actor_id' => auth()->guard('user')->id(), 'action' => 'cancellation_closed', 'changes' => ['cancellation_request_id' => (int) $r->id, 'decision_reason' => $reason]]);
        }
    }
}
