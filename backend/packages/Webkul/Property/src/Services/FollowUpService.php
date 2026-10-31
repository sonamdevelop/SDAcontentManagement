<?php

namespace Webkul\Property\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Webkul\Activity\Repositories\ActivityRepository;
use Webkul\Property\Repositories\LeadApiRepository;

class FollowUpService
{
    public function __construct(protected LeadApiRepository $leads, protected ActivityRepository $activities) {}

    public function listing(array $filters, ?int $leadId = null)
    {
        if ($leadId !== null) {
            $this->leads->authorized($leadId);
        }
        $visible = $this->leads->scopedQuery()->select('leads.id');
        $query = $this->activities->getModel()->newQuery()->whereIn('type', ['note', 'task'])
            ->whereHas('leads', function ($query) use ($visible, $leadId) {
                $query->whereIn('leads.id', $visible);
                if ($leadId !== null) {
                    $query->where('leads.id', $leadId);
                }
            });
        if (! empty($filters['type'])) {
            $query->where('type', $filters['type']);
        }
        if (isset($filters['status'])) {
            $query->where('is_done', $filters['status'] === 'done' ? 1 : 0);
        }
        if (! empty($filters['overdue'])) {
            $query->where('type', 'task')->where('is_done', 0)->where('schedule_to', '<', now());
        }
        foreach (['due_after' => '>=', 'due_before' => '<='] as $field => $operator) {
            if (isset($filters[$field])) {
                $query->where('schedule_to', $operator, $this->localDate($filters[$field]));
            }
        }
        $page = $query->orderByRaw('schedule_to IS NULL')->orderBy('schedule_to')->orderBy('id')->paginate($filters['per_page'] ?? 20)->withQueryString();
        // The CRM custom-attribute trait shadows inverse pivot attributes on lead models.
        // Read only scoped pivot IDs instead of hydrating those inverse lead models.
        $links = DB::table('lead_activities')->whereIn('activity_id', $page->getCollection()->modelKeys())
            ->whereIn('lead_id', $this->leads->scopedQuery()->select('leads.id'))
            ->get(['activity_id', 'lead_id'])->groupBy('activity_id');
        foreach ($page as $activity) {
            $activity->setRelation('apiLeadIds', collect($links->get($activity->id, collect())->pluck('lead_id')->map(fn ($id) => (int) $id)->all()));
        }

        return $page;
    }

    public function create(int $leadId, array $data)
    {
        return DB::transaction(function () use ($leadId, $data) {
            $lead = $this->leads->authorized($leadId, true);
            $task = $data['type'] === 'task';
            $due = $task ? $this->localDate($data['due_at']) : null;
            $activity = $this->activities->create([
                'type' => $data['type'], 'title' => $data['title'] ?? null,
                'comment' => isset($data['comment']) ? htmlspecialchars($data['comment'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') : null,
                'schedule_from' => $due, 'schedule_to' => $due,
                'is_done' => $task ? ($data['is_done'] ?? false) : true,
                'user_id' => $task ? ($lead->user_id ?? auth()->guard('user')->id()) : auth()->guard('user')->id(),
                'additional' => json_encode(['api_plain_text' => true]),
            ]);
            $lead->activities()->attach($activity->id);

            return $activity->setRelation('apiLeadIds', collect([$leadId]));
        });
    }

    public function update(int $leadId, int $activityId, array $data)
    {
        return DB::transaction(function () use ($leadId, $activityId, $data) {
            $this->leads->authorized($leadId, true);
            $activity = $this->editable($leadId, $activityId);
            $changes = array_intersect_key($data, array_flip(['title', 'is_done']));
            if ($activity->type === 'note') {
                unset($changes['is_done']);
                $changes['is_done'] = 1;
            }
            if (array_key_exists('comment', $data)) {
                $changes['comment'] = htmlspecialchars($data['comment'] ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $additional = json_decode($activity->additional ?? '{}', true) ?: [];
                $changes['additional'] = json_encode(array_merge($additional, ['api_plain_text' => true]));
            }
            if ($activity->type === 'task' && isset($data['due_at'])) {
                $changes['schedule_from'] = $changes['schedule_to'] = $this->localDate($data['due_at']);
            }

            return $this->activities->update($changes, $activity->id)->refresh()->setRelation('apiLeadIds', collect([$leadId]));
        });
    }

    public function delete(int $leadId, int $activityId): void
    {
        DB::transaction(function () use ($leadId, $activityId) {
            $this->leads->authorized($leadId, true);
            $activity = $this->editable($leadId, $activityId);
            $this->activities->delete($activity->id);
        });
    }

    protected function editable(int $leadId, int $activityId)
    {
        $activity = $this->activities->getModel()->newQuery()->lockForUpdate()->whereIn('type', ['note', 'task'])
            ->whereHas('leads', fn ($query) => $query->where('leads.id', $leadId))->findOrFail($activityId);
        abort_if($activity->leads()->count() !== 1 || $activity->persons()->exists() || $activity->products()->exists() || $activity->warehouses()->exists(), 404);
        if ($activity->type === 'note') {
            $ids = bouncer()->getAuthorizedUserIds();
            abort_if($ids !== null && ! in_array($activity->user_id, $ids), 404);
        }

        return $activity;
    }

    protected function localDate(string $value): string
    {
        return Carbon::parse($value)->setTimezone(config('app.timezone'))->format('Y-m-d H:i:s');
    }
}
