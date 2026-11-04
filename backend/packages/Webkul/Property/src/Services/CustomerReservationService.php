<?php

namespace Webkul\Property\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\CustomerRepository;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\StayBookingQuote;
use Webkul\Property\Support\StayDates;

class CustomerReservationService
{
    public function __construct(protected StayRepository $stays, protected StayBookingRepository $bookings, protected CustomerRepository $customers, protected StayBookingService $schedule) {}

    public function availability(int $roomId, array $data): array
    {
        return DB::transaction(function () use ($roomId, $data) {
            $room = $this->stays->customerRoom($roomId, true);
            $nights = $this->schedule->window($room, $data);
            $occupancy = $this->bookings->occupancy($roomId, $data['check_in'], $data['check_out'])->toArray();

            return ['room_type_id' => $room->id, 'stay_name' => $room->stay->name, 'room_name' => $room->name, 'timezone' => $room->stay->timezone, 'check_in' => $data['check_in'], 'check_out' => $data['check_out'], 'nights' => $nights, 'capacity' => $room->capacity, 'nightly_rate' => $room->nightly_rate, 'currency' => config('app.currency'), 'available_rooms' => max(0, $room->inventory - StayDates::peak($occupancy, $data['check_in'], $data['check_out']))];
        }, 3);
    }

    private function replay($record, int $customerId, string $hash)
    {
        abort_unless($record->customer_id === $customerId && $record->created_by === null && hash_equals($record->payload_hash, $hash), 409);

        return $record;
    }

    public function reserve(int $customerId, array $data): array
    {
        $data['request_id'] = strtolower($data['request_id']);
        $data['expected_rate'] = DealMoney::normalize($data['expected_rate']);
        $data['guest_name'] = trim($data['guest_name']);
        $data['guest_phone'] = isset($data['guest_phone']) ? trim($data['guest_phone']) : null;
        ksort($data);
        $hash = hash('sha256', json_encode(['customer-reservation-v1', $customerId, $data], JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($customerId, $data, $hash) {
                // Parent -> room -> customer -> request/booking: no staff identity is fabricated.
                $room = $this->stays->customerRoom($data['room_type_id'], true, false);
                $customer = $this->customers->locked($customerId);
                abort_unless($customer->active, 403);
                $existing = $this->bookings->request($data['request_id']);
                if ($existing) {
                    return [$this->replay($existing, $customerId, $hash), false];
                }
                if ($customer->email_verified_at === null) {
                    throw ValidationException::withMessages(['email' => trans('admin::app.customer-actions.verification-required')]);
                }
                abort_unless($room->active && $room->is_published && $room->stay->active && $room->stay->is_published, 404);
                $nights = $this->schedule->window($room, $data);
                try {
                    $total = StayBookingQuote::cents($room->nightly_rate, $data['expected_rate'], $data['rooms'], $data['guests'], $room->capacity, $nights);
                } catch (\InvalidArgumentException $e) {
                    $field = match ($e->getMessage()) {
                        'capacity' => 'guests', 'rate-changed', 'positive' => 'expected_rate', default => 'rooms'
                    };
                    throw ValidationException::withMessages([$field => trans('admin::app.stay-api.'.$e->getMessage())]);
                }
                $occupancy = $this->bookings->occupancy($room->id, $data['check_in'], $data['check_out'])->toArray();
                if (StayDates::peak($occupancy, $data['check_in'], $data['check_out']) + $data['rooms'] > $room->inventory) {
                    throw ValidationException::withMessages(['rooms' => trans('admin::app.stay-api.unavailable')]);
                }
                $record = $this->bookings->createForCustomer([
                    'request_id' => $data['request_id'], 'payload_hash' => $hash, 'room_type_id' => $room->id,
                    'user_id' => $room->stay->user_id, 'created_by' => null, 'stay_name' => $room->stay->name,
                    'room_name' => $room->name, 'timezone' => $room->stay->timezone, 'check_in' => $data['check_in'],
                    'check_out' => $data['check_out'], 'rooms' => $data['rooms'], 'guests' => $data['guests'],
                    'guest_name' => $data['guest_name'], 'guest_email' => $customer->email, 'guest_phone' => $data['guest_phone'],
                    'nightly_rate' => $room->nightly_rate, 'total' => StayDates::amount($total), 'advance' => '0.00',
                    'currency' => config('app.currency'), 'status' => 'confirmed', 'payment_reference' => null, 'notes' => null,
                ], $customerId);
                $record->events()->create(['actor_id' => null, 'customer_actor_id' => $customerId, 'action' => 'customer_created', 'changes' => ['status' => 'confirmed', 'check_in' => $record->check_in, 'check_out' => $record->check_out, 'rooms' => $record->rooms, 'total' => $record->total, 'advance' => '0.00']]);

                return [$record, true];
            }, 3);
        } catch (QueryException $e) {
            $existing = $this->bookings->request($data['request_id']);
            if (! $existing) {
                throw $e;
            }

            return [$this->replay($existing, $customerId, $hash), false];
        }
    }
}
