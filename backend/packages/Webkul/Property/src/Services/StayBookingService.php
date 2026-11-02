<?php

namespace Webkul\Property\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\StayDates;

class StayBookingService
{
    public function __construct(protected StayRepository $stays, protected StayBookingRepository $bookings) {}

    protected function invalid(string $field, string $key): never
    {
        throw ValidationException::withMessages([$field => trans('admin::app.stay-api.'.$key)]);
    }

    public function window($room, array $data, bool $future = true): int
    {
        try {
            $n = StayDates::nights($data['check_in'], $data['check_out']);
        } catch (\InvalidArgumentException) {
            $this->invalid('check_out', 'dates');
        }
        if ($future && $data['check_in'] < now($room->stay->timezone)->format('Y-m-d')) {
            $this->invalid('check_in', 'past');
        }

        return $n;
    }

    public function availability(int $id, array $data): array
    {
        return DB::transaction(function () use ($id, $data) {
            $room = $this->stays->room($id, true);
            $n = $this->window($room, $data);
            $occupied = $this->bookings->occupancy($id, $data['check_in'], $data['check_out'])->toArray();

            return ['room_type_id' => $id, 'check_in' => $data['check_in'], 'check_out' => $data['check_out'], 'nights' => $n, 'timezone' => $room->stay->timezone, 'nightly_rate' => $room->nightly_rate, 'currency' => config('app.currency'), 'capacity' => $room->capacity, 'available_rooms' => ($room->active && $room->stay->active) ? max(0, $room->inventory - StayDates::peak($occupied, $data['check_in'], $data['check_out'])) : 0];
        }, 3);
    }

    public function reserve(array $data): array
    {
        $data['request_id'] = strtolower($data['request_id']);
        $data['advance'] = DealMoney::normalize($data['advance'] ?? '0');
        $data['expected_rate'] = DealMoney::normalize($data['expected_rate']);
        foreach (['guest_name', 'guest_email', 'guest_phone', 'payment_reference', 'notes'] as $key) {
            $data[$key] = isset($data[$key]) ? trim($data[$key]) : null;
        }
        ksort($data);
        $hash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($data, $hash) {
                $room = $this->stays->room($data['room_type_id'], true);
                $existing = $this->bookings->request($data['request_id']);
                if ($existing) {
                    return [$this->replay($existing, $hash), false];
                }
                $nights = $this->window($room, $data);
                if (! $room->active || ! $room->stay->active) {
                    $this->invalid('room_type_id', 'inactive');
                }
                if ($data['guests'] > $data['rooms'] * $room->capacity) {
                    $this->invalid('guests', 'capacity');
                }
                if ($data['expected_rate'] !== $room->nightly_rate) {
                    $this->invalid('expected_rate', 'rate-changed');
                }
                $factor = $nights * $data['rooms'];
                $rate = DealMoney::cents($room->nightly_rate);
                if ($rate > intdiv(999999999999999, $factor)) {
                    $this->invalid('rooms', 'amount-limit');
                }
                $total = $rate * $factor;
                if (DealMoney::cents($data['advance']) > $total) {
                    $this->invalid('advance', 'advance');
                }
                $occupied = $this->bookings->occupancy($room->id, $data['check_in'], $data['check_out'])->toArray();
                if (StayDates::peak($occupied, $data['check_in'], $data['check_out']) + $data['rooms'] > $room->inventory) {
                    $this->invalid('rooms', 'unavailable');
                }
                $record = $this->bookings->create(array_merge($data, ['payload_hash' => $hash, 'user_id' => $room->stay->user_id, 'created_by' => auth()->guard('user')->id(), 'stay_name' => $room->stay->name, 'room_name' => $room->name, 'timezone' => $room->stay->timezone, 'nightly_rate' => $room->nightly_rate, 'total' => StayDates::amount($total), 'currency' => config('app.currency'), 'status' => 'confirmed']));
                $record->events()->create(['actor_id' => auth()->guard('user')->id(), 'action' => 'created', 'changes' => ['status' => 'confirmed', 'check_in' => $record->check_in, 'check_out' => $record->check_out, 'rooms' => $record->rooms, 'total' => $record->total, 'advance' => $record->advance, 'payment_reference' => $record->payment_reference]]);

                return [$record->load('events'), true];
            }, 3);
        } catch (QueryException $e) {
            // The UUID is globally unique even when simultaneous submissions target different rooms.
            $existing = $this->bookings->request($data['request_id']);
            if (! $existing) {
                throw $e;
            }

            return [$this->replay($existing, $hash), false];
        }
    }

    protected function replay($record, string $hash)
    {
        $this->bookings->authorized($record->id);
        abort_unless($record->created_by === auth()->guard('user')->id() && hash_equals($record->payload_hash, $hash), 409);

        return $record->load('events');
    }

    public function cancel(int $id, string $reason)
    {
        return DB::transaction(function () use ($id, $reason) {
            $initial = $this->bookings->authorized($id);
            $this->stays->room($initial->room_type_id, true);
            $record = $this->bookings->authorized($id, true);
            if ($record->status === 'cancelled') {
                return $record->load('events');
            }
            if ($record->check_in <= now($record->timezone)->format('Y-m-d')) {
                $this->invalid('status', 'started');
            }
            $record->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => $reason]);
            $record->events()->create(['actor_id' => auth()->guard('user')->id(), 'action' => 'cancelled', 'changes' => ['status' => 'cancelled', 'cancellation_reason' => $reason]]);

            return $record->load('events');
        }, 3);
    }

    public function saveStay(array $data, ?int $id = null)
    {
        return DB::transaction(function () use ($data, $id) {
            $stay = $id ? $this->stays->authorized($id, true) : null;
            if ($stay && $stay->timezone !== $data['timezone'] && $stay->rooms()->exists()) {
                $this->invalid('timezone', 'timezone');
            }

            return $stay ? tap($stay)->update($data) : $this->stays->create($data + ['user_id' => auth()->guard('user')->id()]);
        }, 3);
    }

    public function saveRoom(int $stayId, array $data, ?int $id = null)
    {
        return DB::transaction(function () use ($stayId, $data, $id) {
            $stay = $this->stays->authorized($stayId, true);
            $room = $id ? $stay->rooms()->lockForUpdate()->findOrFail($id) : null;
            if (DealMoney::cents($data['nightly_rate']) === 0) {
                $this->invalid('nightly_rate', 'positive');
            }
            if ($room && ($room->inventory !== $data['inventory'] || $room->capacity !== $data['capacity']) && $this->bookings->occupancy($id, now($stay->timezone)->format('Y-m-d'), '9999-12-31')->isNotEmpty()) {
                $this->invalid('inventory', 'inventory');
            }
            $data['nightly_rate'] = DealMoney::normalize($data['nightly_rate']);

            return $room ? tap($room)->update($data) : $stay->rooms()->create($data);
        }, 3);
    }
}
