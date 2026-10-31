<?php

namespace Webkul\Property\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Contact\Repositories\PersonRepository;
use Webkul\Property\Repositories\LeadApiRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Repositories\SiteVisitEventRepository;
use Webkul\Property\Repositories\SiteVisitRepository;
use Webkul\Property\Support\SiteVisitState;
use Webkul\User\Repositories\UserRepository;

class SiteVisitService
{
    public function __construct(protected SiteVisitRepository $visits, protected SiteVisitEventRepository $events, protected PropertyRepository $properties, protected LeadApiRepository $leads, protected UserRepository $users, protected PersonRepository $persons) {}

    public function agentQuery()
    {
        $query = $this->users->getModel()->newQuery()->where('status', 1)->whereHas('role', function ($q) {
            $q->where('permission_type', 'all')->orWhere(fn ($q) => $q->where('permission_type', 'custom')->whereJsonContains('permissions', 'visits.view'));
        });
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $query->whereIn('id', $ids);
        }

return $query;
    }

    public function create(array $data)
    {
        abort_unless(bouncer()->hasPermission('properties') && bouncer()->hasPermission('leads.view'), 403);

        return DB::transaction(function () use ($data) {
            $this->properties->authorized($data['property_id']);
            $this->leads->authorized($data['lead_id']);
            [$property,$lead,$person] = $this->sources($data['property_id'], $data['lead_id']);
            $agent = $this->agent($data['user_id']);
            [$start,$end] = $this->window($data['starts_at'], $data['ends_at']);
            $this->available($property->id, $person->id, $agent->id, $start, $end);
            $visit = $this->visits->create([
                'property_id' => $property->id, 'lead_id' => $lead->id, 'person_id' => $person->id, 'user_id' => $agent->id, 'created_by' => auth()->guard('user')->id(),
                'property_title' => $property->title, 'property_city' => $property->city, 'customer_name' => $person->name,
                'customer_email' => $person->emails[0]['value'] ?? null, 'customer_phone' => $person->contact_numbers[0]['value'] ?? null,
                'starts_at' => $start, 'ends_at' => $end, 'status' => 'scheduled', 'notes' => $data['notes'] ?? null, 'reschedule_count' => 0,
            ]);
            $this->record($visit, 'scheduled', ['starts_at' => $visit->starts_at->toIso8601String(), 'ends_at' => $visit->ends_at->toIso8601String(), 'user_id' => $agent->id]);

            return $visit->refresh()->load('events');
        }, 3);
    }

    public function reschedule(int $id, array $data)
    {
        return DB::transaction(function () use ($id, $data) {
            $visit = $this->visits->authorized($id, true);
            $this->scheduled($visit);
            if (! $visit->property_id || ! $visit->lead_id) {
                $this->invalid('starts_at', 'visit-source-missing');
            }
            [$property,$lead,$person] = $this->sources($visit->property_id, $visit->lead_id);
            if ($person->id !== $visit->person_id) {
                $this->invalid('lead_id', 'visit-customer-changed');
            }
            $this->agent($visit->user_id);
            [$start,$end] = $this->window($data['starts_at'], $data['ends_at']);
            $this->available($property->id, $person->id, $visit->user_id, $start, $end, $visit->id);
            if ($start === $visit->starts_at->format('Y-m-d H:i:s') && $end === $visit->ends_at->format('Y-m-d H:i:s')) {
                return $visit->load('events');
            }
            $changes = ['old_starts_at' => $visit->starts_at->toIso8601String(), 'old_ends_at' => $visit->ends_at->toIso8601String(), 'starts_at' => Carbon::parse($start, config('app.timezone'))->toIso8601String(), 'ends_at' => Carbon::parse($end, config('app.timezone'))->toIso8601String(), 'reason' => $data['reason']];
            $saved = $this->visits->update(['starts_at' => $start, 'ends_at' => $end, 'last_rescheduled_at' => now(), 'reschedule_reason' => $data['reason'], 'reschedule_count' => $visit->reschedule_count + 1], $id);
            $this->record($saved, 'rescheduled', $changes);

            return $saved->refresh()->load('events');
        }, 3);
    }

    public function assign(int $id, int $userId)
    {
        return DB::transaction(function () use ($id, $userId) {
            $visit = $this->visits->authorized($id, true);
            $this->scheduled($visit);
            if (! $visit->property_id || ! $visit->lead_id) {
                $this->invalid('user_id', 'visit-source-missing');
            }
            [$property,$lead,$person] = $this->sources($visit->property_id, $visit->lead_id);
            if ($person->id !== $visit->person_id) {
                $this->invalid('lead_id', 'visit-customer-changed');
            }
            // Stable user lock order prevents two assignment swaps from reversing agent locks.
            $this->users->getModel()->newQuery()->whereIn('id', [$visit->user_id, $userId])->orderBy('id')->lockForUpdate()->get();
            $agent = $this->agent($userId);
            $this->available($property->id, $person->id, $agent->id, $visit->starts_at->format('Y-m-d H:i:s'), $visit->ends_at->format('Y-m-d H:i:s'), $visit->id);
            if ($visit->user_id === $agent->id) {
                return $visit->load('events');
            }
            $old = $visit->user_id;
            $saved = $this->visits->update(['user_id' => $agent->id], $id);
            $this->record($saved, 'assigned', ['old_user_id' => $old, 'user_id' => $agent->id]);

            return $saved->refresh()->load('events');
        }, 3);
    }

    public function status(int $id, array $data)
    {
        return DB::transaction(function () use ($id, $data) {
            $visit = $this->visits->authorized($id, true);
            $next = $data['status'];
            if (! SiteVisitState::allows($visit->status, $next, $visit->starts_at, now())) {
                $this->invalid('status', 'visit-transition');
            }
            if ($visit->status === $next) {
                return $visit->load('events');
            }
            if ($next === 'completed' && trim($data['feedback'] ?? '') === '') {
                $this->invalid('feedback', 'visit-feedback');
            }
            if ($next === 'cancelled' && trim($data['cancellation_reason'] ?? '') === '') {
                $this->invalid('cancellation_reason', 'visit-cancel-reason');
            }
            $changes = ['status' => $next];
            if ($next === 'completed') {
                $changes['completed_at'] = now();
                $changes['feedback'] = $data['feedback'];
            }
            if ($next === 'cancelled') {
                $changes['cancelled_at'] = now();
                $changes['cancellation_reason'] = $data['cancellation_reason'];
            }
            if ($next === 'no_show') {
                $changes['no_show_at'] = now();
                $changes['feedback'] = $data['feedback'] ?? null;
            }
            $saved = $this->visits->update($changes, $id);
            $this->record($saved, $next, ['old_status' => $visit->status, 'status' => $next]);

            return $saved->refresh()->load('events');
        });
    }

    public function feedback(int $id, string $feedback)
    {
        return DB::transaction(function () use ($id, $feedback) {
            $visit = $this->visits->authorized($id, true);
            if (! in_array($visit->status, ['completed', 'no_show'], true)) {
                $this->invalid('feedback', 'visit-feedback-state');
            }
            if ($visit->feedback === $feedback) {
                return $visit->load('events');
            }
            $old = $visit->feedback;
            $saved = $this->visits->update(['feedback' => $feedback], $id);
            $this->record($saved, 'feedback_updated', ['old_feedback' => $old, 'feedback' => $feedback]);

            return $saved->refresh()->load('events');
        });
    }

    protected function sources(int $propertyId, int $leadId): array
    {
        // Serialize shared property/customer resources before checking slot availability.
        $property = $this->properties->getModel()->newQuery()->lockForUpdate()->findOrFail($propertyId);
        $lead = $this->leads->getModel()->newQuery()->lockForUpdate()->findOrFail($leadId);
        if ($property->status !== 'available') {
            $this->invalid('property_id', 'visit-property-unavailable');
        }
        if ($lead->closed_at || in_array($lead->stage?->code, ['won', 'lost'], true)) {
            $this->invalid('lead_id', 'visit-lead-closed');
        }
        $person = $lead->person_id ? $this->persons->getModel()->newQuery()->lockForUpdate()->find($lead->person_id) : null;
        if (! $person) {
            $this->invalid('lead_id', 'visit-customer-missing');
        }

        return [$property, $lead, $person];
    }

    protected function agent(int $id)
    {
        $agent = $this->agentQuery()->lockForUpdate()->find($id);
        if (! $agent) {
            $this->invalid('user_id', 'visit-agent');
        }

return $agent;
    }

    protected function window(string $start, string $end): array
    {
        $start = Carbon::parse($start)->setTimezone(config('app.timezone'));
        $end = Carbon::parse($end)->setTimezone(config('app.timezone'));
        if (! SiteVisitState::validWindow($start, $end, now())) {
            $this->invalid('starts_at', 'visit-window');
        }

        return [$start->format('Y-m-d H:i:s'), $end->format('Y-m-d H:i:s')];
    }

    protected function available(int $propertyId, int $personId, int $userId, string $start, string $end, ?int $except = null): void
    {
        $query = $this->visits->getModel()->newQuery()->where('status', 'scheduled')->where('starts_at', '<', $end)->where('ends_at', '>', $start)
            ->where(fn ($q) => $q->where('property_id', $propertyId)->orWhere('person_id', $personId)->orWhere('user_id', $userId));
        if ($except !== null) {
            $query->where('id', '<>', $except);
        }
        if ($query->lockForUpdate()->first(['id'])) {
            $this->invalid('starts_at', 'visit-conflict');
        }
    }

    protected function scheduled($visit): void
    {
        if ($visit->status !== 'scheduled') {
            $this->invalid('status', 'visit-scheduled-only');
        }
    }

    protected function record($visit,string $action,array $changes): void
    {
        $this->events->create(['site_visit_id' => $visit->id, 'actor_id' => auth()->guard('user')->id(), 'action' => $action, 'changes' => $changes]);
    }

    protected function invalid(string $field,string $key): never
    {
        throw ValidationException::withMessages([$field => trans('admin::app.property-api.'.$key)]);
    }
}
