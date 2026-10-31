<?php

namespace Webkul\Property\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Activity\Repositories\ActivityRepository;
use Webkul\Lead\Repositories\LeadRepository;
use Webkul\Lead\Repositories\PipelineRepository;
use Webkul\Lead\Repositories\StageRepository;
use Webkul\Property\Repositories\LeadApiRepository;
use Webkul\Property\Support\LeadStageState;
use Webkul\User\Repositories\UserRepository;

class LeadApiService
{
    public function __construct(protected LeadApiRepository $leads, protected LeadRepository $writer, protected UserRepository $users, protected StageRepository $stages, protected PipelineRepository $pipelines, protected ActivityRepository $activities) {}

    public function assigneeQuery()
    {
        $query = $this->users->getModel()->newQuery()->where('status', 1)->whereHas('role', function ($query) {
            $query->where('permission_type', 'all')->orWhere(function ($query) {
                $query->where('permission_type', 'custom')->whereJsonContains('permissions', 'leads.view');
            });
        });
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $query->whereIn('id', $ids);
        }

        return $query;
    }

    public function pipelines()
    {
        return $this->pipelines->getModel()->newQuery()->with('stages')->orderBy('id')->get();
    }

    public function assign(int $id, int $userId)
    {
        return DB::transaction(function () use ($id, $userId) {
            $lead = $this->leads->authorized($id, true);
            $target = $this->assigneeQuery()->lockForUpdate()->find($userId);
            if (! $target) {
                throw ValidationException::withMessages(['user_id' => trans('admin::app.property-api.invalid-assignee')]);
            }
            // A restricted attribute update avoids the CRM's full-update product replacement path.
            $saved = $this->writer->update(['entity_type' => 'leads', 'user_id' => $target->id], $id, ['user_id']);
            // Transfer exclusive task ownership so the new agent can manage tasks in the CRM too.
            foreach ($lead->activities()->where('type', 'task')->get() as $task) {
                if ($task->leads()->count() === 1 && ! $task->persons()->exists() && ! $task->products()->exists() && ! $task->warehouses()->exists()) {
                    $this->activities->update(['user_id' => $target->id], $task->id);
                }
            }

            return $saved->refresh()->load(['user', 'pipeline', 'stage', 'person']);
        });
    }

    public function stage(int $id, array $data)
    {
        return DB::transaction(function () use ($id, $data) {
            $lead = $this->leads->authorized($id, true);
            $stage = $this->stages->getModel()->newQuery()->where('lead_pipeline_id', $lead->lead_pipeline_id)->find($data['lead_pipeline_stage_id']);
            if (! $stage) {
                throw ValidationException::withMessages(['lead_pipeline_stage_id' => trans('admin::app.property-api.invalid-stage')]);
            }
            $reason = $data['lost_reason'] ?? ($lead->stage?->code === 'lost' ? $lead->lost_reason : null);
            if ($stage->code === 'lost' && trim($reason ?? '') === '') {
                throw ValidationException::withMessages(['lost_reason' => trans('admin::app.property-api.lost-reason')]);
            }
            $changes = LeadStageState::changes($stage->code, $reason, $lead->closed_at, now());
            $saved = $this->writer->update(array_merge($changes, ['entity_type' => 'leads', 'lead_pipeline_stage_id' => $stage->id]), $id, ['lead_pipeline_stage_id', 'closed_at', 'lost_reason']);

            return $saved->refresh()->load(['user', 'pipeline', 'stage', 'person']);
        });
    }
}
