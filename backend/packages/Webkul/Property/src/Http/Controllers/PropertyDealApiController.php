<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Http\Requests\PropertyDealFilters;
use Webkul\Property\Http\Requests\PropertyDealRequest;
use Webkul\Property\Http\Resources\PropertyDealResource;
use Webkul\Property\Http\Resources\PropertyDealSummaryResource;
use Webkul\Property\Repositories\PropertyDealRepository;
use Webkul\Property\Services\PropertyDealService;

class PropertyDealApiController
{
    public function __construct(protected PropertyDealRepository $deals, protected PropertyDealService $service) {}

    public function index(PropertyDealFilters $request)
    {
        return PropertyDealSummaryResource::collection($this->deals->listing($request->validated()))->response()->header('Cache-Control', 'no-store');
    }

    public function show(int $id)
    {
        return (new PropertyDealResource($this->deals->authorized($id)->load('events')))->response()->header('Cache-Control', 'no-store');
    }

    public function store(PropertyDealRequest $request)
    {
        [$deal, $created] = $this->service->reserve($request->validated());

        return (new PropertyDealResource($deal))->response()->setStatusCode($created ? 201 : 200)->header('Cache-Control', 'no-store');
    }

    public function confirm(int $id)
    {
        return (new PropertyDealResource($this->service->transition($id, 'confirmed')))->response()->header('Cache-Control', 'no-store');
    }

    public function cancel(Request $request, int $id)
    {
        $data = $request->validate(['cancellation_reason' => 'required|string|max:1000']);

        return (new PropertyDealResource($this->service->transition($id, 'cancelled', $data['cancellation_reason'])))->response()->header('Cache-Control', 'no-store');
    }
}
