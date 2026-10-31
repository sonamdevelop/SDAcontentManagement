<?php

namespace Webkul\Property\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Contact\Repositories\PersonRepository;
use Webkul\Property\Repositories\LeadApiRepository;
use Webkul\Property\Repositories\PropertyDealEventRepository;
use Webkul\Property\Repositories\PropertyDealRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Support\DealMoney;
use Webkul\Property\Support\DealState;

class PropertyDealService
{
    public function __construct(protected PropertyDealRepository $deals, protected PropertyDealEventRepository $events, protected PropertyRepository $properties, protected LeadApiRepository $leads, protected PersonRepository $persons) {}

    public function reserve(array $data): array
    {
        $this->sourceAccess(true);
        $data['request_id'] = strtolower($data['request_id']);
        $payload = [
            'property_id' => (int) $data['property_id'], 'lead_id' => (int) $data['lead_id'],
            'agreed_price' => DealMoney::normalize($data['agreed_price']), 'booking_amount' => DealMoney::normalize($data['booking_amount'] ?? '0.00'),
            'payment_reference' => $data['payment_reference'] ?? null, 'notes' => $data['notes'] ?? null,
        ];
        $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
        try {
            return DB::transaction(function () use ($data, $payload, $hash) {
                // All writers lock the property before the deal. Read conflicts from the current version.
                $property = $this->properties->getModel()->newQuery()->lockForUpdate()->find($payload['property_id']);
                $existing = $this->deals->getModel()->newQuery()->where('request_id', $data['request_id'])->lockForUpdate()->first();
                if ($existing) {
                    abort_unless($existing->created_by === auth()->guard('user')->id() && hash_equals($existing->payload_hash, $hash), 409, trans('admin::app.property-api.deal-request-conflict'));

                    return [$this->deals->authorized($existing->id, true)->load('events'), false];
                }
                abort_unless($property, 404);
                $property = $this->properties->authorized($property->id, true);
                if ($this->deals->activeForProperty($property->id) || $property->status !== 'available') {
                    $this->invalid('property_id', 'deal-unavailable');
                }
                if (! DealMoney::validAdvance($payload['agreed_price'], $payload['booking_amount'])) {
                    $this->invalid(DealMoney::cents($payload['agreed_price']) === 0 ? 'agreed_price' : 'booking_amount', 'deal-money');
                }
                [$lead, $person] = $this->customer($payload['lead_id']);
                $deal = $this->deals->create(array_merge($payload, [
                    'request_id' => strtolower($data['request_id']), 'payload_hash' => $hash, 'active_property_id' => $property->id,
                    'person_id' => $person->id, 'user_id' => $property->user_id, 'created_by' => auth()->guard('user')->id(),
                    'property_title' => $property->title, 'property_city' => $property->city, 'purpose' => $property->purpose,
                    'rent_period' => $property->purpose === 'rent' ? $property->rent_period : null,
                    'customer_name' => $person->name, 'customer_email' => $person->emails[0]['value'] ?? null,
                    'customer_phone' => $person->contact_numbers[0]['value'] ?? null, 'currency' => config('app.currency'), 'status' => 'reserved',
                ]));
                $property->update(['status' => 'reserved']);
                $this->record($deal, 'reserved', ['status' => 'reserved', 'old_property_status' => 'available', 'property_status' => 'reserved', 'agreed_price' => $deal->agreed_price, 'booking_amount' => $deal->booking_amount]);

                return [$deal->refresh()->load('events'), true];
            }, 3);
        } catch (QueryException $exception) {
            // A concurrent request with the same UUID on another property can hit the unique guard.
            if (($exception->errorInfo[1] ?? null) === 1062) {
                abort(409, trans('admin::app.property-api.deal-request-conflict'));
            }
            throw $exception;
        }
    }

    public function transition(int $id, string $next, ?string $reason = null)
    {
        $this->sourceAccess($next === 'confirmed');
        $initial = $this->deals->authorized($id);

        return DB::transaction(function () use ($initial, $id, $next, $reason) {
            $property = $initial->property_id ? $this->properties->getModel()->newQuery()->lockForUpdate()->find($initial->property_id) : null;
            $deal = $this->deals->authorized($id, true);
            if (! DealState::allows($deal->status, $next)) {
                $this->invalid('status', 'deal-transition');
            }
            if ($deal->status === $next) {
                return $deal->load('events');
            }
            $oldPropertyStatus = $property?->status;
            if ($property) {
                $property = $this->properties->authorized($property->id, true);
            }
            if ($next === 'confirmed') {
                if (! $property || $deal->active_property_id !== $property->id || $property->status !== 'reserved'
                    || $property->purpose !== $deal->purpose || ($deal->purpose === 'rent' && $property->rent_period !== $deal->rent_period)) {
                    $this->invalid('property_id', 'deal-source-changed');
                }
                if (! $deal->lead_id || ! $deal->person_id) {
                    $this->invalid('lead_id', 'deal-source-changed');
                }
                [$lead, $person] = $this->customer($deal->lead_id);
                if ($person->id !== $deal->person_id) {
                    $this->invalid('lead_id', 'deal-source-changed');
                }
                $property->update(['status' => DealState::propertyStatus('confirmed', $deal->purpose)]);
                $saved = $this->deals->update(['status' => 'confirmed', 'confirmed_at' => now()], $id);
            } else {
                if (trim($reason ?? '') === '') {
                    $this->invalid('cancellation_reason', 'deal-cancel-reason');
                }
                // Release only this hold; never overwrite an unrelated externally changed property status.
                if ($property && $deal->active_property_id === $property->id && $property->status === 'reserved') {
                    $property->update(['status' => 'available']);
                }
                $saved = $this->deals->update(['status' => 'cancelled', 'active_property_id' => null, 'cancelled_at' => now(), 'cancellation_reason' => $reason], $id);
            }
            $this->record($saved, $next, ['old_status' => 'reserved', 'status' => $next, 'old_property_status' => $oldPropertyStatus, 'property_status' => $property?->status, 'cancellation_reason' => $next === 'cancelled' ? $reason : null]);

            return $saved->refresh()->load('events');
        }, 3);
    }

    protected function sourceAccess(bool $lead): void
    {
        $token = auth()->guard('user')->user()->currentAccessToken();
        abort_unless(bouncer()->hasPermission('properties') && bouncer()->hasPermission('properties.edit')
            && $token?->can('properties:read') && $token->can('properties:write'), 403);
        if ($lead) {
            abort_unless(bouncer()->hasPermission('leads.view') && $token->can('leads:read'), 403);
        }
    }

    protected function customer(int $id): array
    {
        $lead = $this->leads->authorized($id, true);
        if ($lead->closed_at || in_array($lead->stage?->code, ['won', 'lost'], true)) {
            $this->invalid('lead_id', 'deal-lead-closed');
        }
        $person = $lead->person_id ? $this->persons->getModel()->newQuery()->lockForUpdate()->find($lead->person_id) : null;
        if (! $person) {
            $this->invalid('lead_id', 'deal-customer-missing');
        }

        return [$lead, $person];
    }

    protected function record($deal, string $action, array $changes): void
    {
        $this->events->create(['deal_id' => $deal->id, 'actor_id' => auth()->guard('user')->id(), 'action' => $action, 'changes' => $changes]);
    }

    protected function invalid(string $field, string $key): never
    {
        throw ValidationException::withMessages([$field => trans('admin::app.property-api.'.$key)]);
    }
}
