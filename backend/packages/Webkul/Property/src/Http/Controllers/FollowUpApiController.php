<?php

namespace Webkul\Property\Http\Controllers;

use Webkul\Property\Http\Requests\FollowUpFilters;
use Webkul\Property\Http\Requests\FollowUpRequest;
use Webkul\Property\Http\Resources\FollowUpResource;
use Webkul\Property\Services\FollowUpService;

class FollowUpApiController
{
    public function __construct(protected FollowUpService $service) {}

    public function index(FollowUpFilters $request, ?int $id = null)
    {
        return FollowUpResource::collection($this->service->listing($request->validated(), $id));
    }

    public function store(FollowUpRequest $request, int $id)
    {
        return (new FollowUpResource($this->service->create($id, $request->validated())))->response()->setStatusCode(201);
    }

    public function update(FollowUpRequest $request, int $id, int $activityId)
    {
        return new FollowUpResource($this->service->update($id, $activityId, $request->validated()));
    }

    public function destroy(int $id, int $activityId)
    {
        $this->service->delete($id, $activityId);

        return response()->noContent();
    }
}
