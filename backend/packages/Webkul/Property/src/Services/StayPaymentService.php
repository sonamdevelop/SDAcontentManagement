<?php

namespace Webkul\Property\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayPaymentRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\StayLedger;

class StayPaymentService
{
    public function __construct(protected StayBookingRepository $bookings, protected StayPaymentRepository $payments, protected StayRepository $stays) {}

    private function invalid(string $key): never
    {
        throw ValidationException::withMessages(['amount' => trans('admin::app.stay-api.'.$key)]);
    }

    public function record(int $id, string $kind, array $data, ?int $target = null): array
    {
        abort_unless(in_array($kind, ['payment', 'refund', 'reversal'], true), 404);
        $data['request_id'] = strtolower($data['request_id']);
        if (isset($data['amount'])) {
            $data['amount'] = DealMoney::normalize($data['amount']);
        }
        foreach (['reference', 'reason'] as $field) {
            $data[$field] = isset($data[$field]) ? trim($data[$field]) : null;
        }
        ksort($data);
        $hash = hash('sha256', json_encode([$id, $kind, $target, $data], JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($id, $kind, $data, $target, $hash) {
                $initial = $this->bookings->authorized($id);
                $this->stays->room($initial->room_type_id, true);
                $booking = $this->bookings->authorized($id, true);
                $prior = $this->payments->request($data['request_id']);
                if ($prior) {
                    abort_unless($prior->booking_id === $id && $prior->actor_id === auth()->guard('user')->id() && hash_equals($prior->payload_hash, $hash), 409);

                    return [$prior->load('reversal'), $booking, false, $this->payments->summary($booking, true)];
                }
                $entries = $this->payments->entries($id, true);
                $summary = StayLedger::totals($entries->toArray(), $booking->total, $booking->status);
                $reversalOf = null;
                if ($kind === 'reversal') {
                    $original = $entries->firstWhere('id', $target);
                    abort_unless($original, 404);
                    if ($original->kind === 'reversal' || $entries->contains('reversal_of', $target)) {
                        $this->invalid('ledger-reversed');
                    }
                    $amount = $original->amount;
                    $method = $original->method;
                    $reference = $original->reference;
                    $reversalOf = $original->id;
                } else {
                    $amount = $data['amount'];
                    $method = $data['method'];
                    $reference = $data['reference'];
                    $cents = DealMoney::cents($amount);
                    if ($cents === 0) {
                        $this->invalid('ledger-positive');
                    }
                    if ($kind === 'payment' && ($booking->status !== 'confirmed' || $cents > DealMoney::cents($summary['balance']))) {
                        $this->invalid('ledger-payment-limit');
                    }
                    if ($kind === 'refund' && $cents > DealMoney::cents($summary['net_paid'])) {
                        $this->invalid('ledger-refund-limit');
                    }
                }
                $row = ['id' => 0, 'booking_id' => $id, 'request_id' => $data['request_id'], 'payload_hash' => $hash, 'kind' => $kind, 'amount' => $amount, 'currency' => $booking->currency, 'method' => $method, 'reference' => $reference, 'reason' => $data['reason'], 'reversal_of' => $reversalOf, 'actor_id' => auth()->guard('user')->id()];
                try {
                    $next = StayLedger::totals([...$entries->toArray(), $row], $booking->total, $booking->status);
                } catch (\InvalidArgumentException) {
                    $this->invalid('ledger-invariant');
                }
                if (DealMoney::cents($next['net_paid']) > DealMoney::cents($booking->total)) {
                    $this->invalid('ledger-invariant');
                }
                unset($row['id']);
                $entry = $this->payments->create($row);
                $booking->events()->create(['actor_id' => auth()->guard('user')->id(), 'action' => match ($kind) {
                    'payment' => 'payment_recorded','refund' => 'refund_recorded',default => 'payment_reversed'
                }, 'changes' => ['entry_id' => $entry->id, 'amount' => $entry->amount, 'kind' => $kind, 'net_paid' => $next['net_paid']]]);

                return [$entry->load('reversal'), $booking, true, $next];
            }, 3);
        } catch (QueryException $e) {
            $prior = $this->payments->request($data['request_id']);
            if (! $prior) {
                throw $e;
            }

            return $this->record($id,$kind,$data,$target);
        }
    }
}
