<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Http\Requests\LeadFilters;
use Webkul\Property\Http\Resources\AgentOptionResource;
use Webkul\Property\Http\Resources\LeadResource;
use Webkul\Property\Http\Resources\LeadSummaryResource;
use Webkul\Property\Repositories\LeadApiRepository;
use Webkul\Property\Services\LeadApiService;

class LeadApiController
{
    public function __construct(protected LeadApiRepository $leads, protected LeadApiService $service) {}

    public function index(LeadFilters $request)
    {
        return LeadSummaryResource::collection($this->leads->listing($request->validated()));
    }

    public function show(int $id)
    {
        return new LeadResource($this->leads->authorized($id)->load(['user', 'person', 'pipeline', 'stage']));
    }

    public function assign(Request $request, int $id)
    {
        $data = $request->validate(['user_id' => 'required|integer|min:1']);

        return new LeadResource($this->service->assign($id, $data['user_id']));
    }

    public function stage(Request $request, int $id)
    {
        $data = $request->validate(['lead_pipeline_stage_id' => 'required|integer|min:1', 'lost_reason' => ['nullable', 'string', 'max:5000', 'not_regex:/\{\{/']]);

        return new LeadResource($this->service->stage($id, $data));
    }

    public function pipelines()
    {
        return response()->json(['data' => $this->service->pipelines()->map(fn ($pipeline) => [
            'id' => $pipeline->id, 'name' => $pipeline->name, 'is_default' => (bool) $pipeline->is_default,
            'stages' => $pipeline->stages->map(fn ($stage) => ['id' => $stage->id, 'name' => $stage->name, 'code' => $stage->code])->values()->all(),
        ])->values()]);
    }

    public function assignees(Request $request)
    {
        $data = $request->validate(['page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100']);

        return AgentOptionResource::collection($this->service->assigneeQuery()->select(['id', 'name'])->orderBy('name')->paginate($data['per_page'] ?? 20)->withQueryString());
    }
}
