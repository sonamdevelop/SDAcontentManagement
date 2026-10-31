<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Http\Requests\SiteVisitFilters;
use Webkul\Property\Http\Requests\SiteVisitRequest;
use Webkul\Property\Http\Resources\AgentOptionResource;
use Webkul\Property\Http\Resources\SiteVisitResource;
use Webkul\Property\Http\Resources\SiteVisitSummaryResource;
use Webkul\Property\Repositories\SiteVisitRepository;
use Webkul\Property\Services\SiteVisitService;

class SiteVisitApiController
{
    public function __construct(protected SiteVisitRepository $visits, protected SiteVisitService $service) {}

    public function index(SiteVisitFilters $request)
    {
        return SiteVisitSummaryResource::collection($this->visits->listing($request->validated()));
    }

    public function show(int $id)
    {
        return new SiteVisitResource($this->visits->authorized($id)->load('events'));
    }

    public function store(SiteVisitRequest $request)
    {
        return (new SiteVisitResource($this->service->create($request->validated())))->response()->setStatusCode(201);
    }

    public function schedule(SiteVisitRequest $request, int $id)
    {
        return new SiteVisitResource($this->service->reschedule($id, $request->validated()));
    }

    public function assign(Request $request, int $id)
    {
        $data = $request->validate(['user_id' => 'required|integer|min:1']);

        return new SiteVisitResource($this->service->assign($id, $data['user_id']));
    }

    public function status(Request $request, int $id)
    {
        $data = $request->validate(['status' => 'required|in:scheduled,completed,cancelled,no_show', 'feedback' => 'nullable|string|max:5000', 'cancellation_reason' => 'nullable|string|max:1000']);

        return new SiteVisitResource($this->service->status($id, $data));
    }

    public function feedback(Request $request, int $id)
    {
        $data = $request->validate(['feedback' => 'required|string|max:5000']);

        return new SiteVisitResource($this->service->feedback($id, $data['feedback']));
    }

    public function agents(Request $request)
    {
        abort_unless(bouncer()->hasPermission('visits.create') || bouncer()->hasPermission('visits.assign'), 403);
        $data = $request->validate(['page' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100']);

        return AgentOptionResource::collection($this->service->agentQuery()->select(['id', 'name'])->orderBy('name')->paginate($data['per_page'] ?? 20)->withQueryString());
    }
}
