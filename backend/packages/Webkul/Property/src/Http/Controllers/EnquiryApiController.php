<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Http\Requests\EnquiryRequest;
use Webkul\Property\Http\Resources\EnquiryResource;
use Webkul\Property\Repositories\EnquiryRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Services\EnquiryService;

class EnquiryApiController
{
    public function __construct(protected EnquiryService $service, protected EnquiryRepository $enquiries, protected PropertyRepository $properties) {}

    public function store(EnquiryRequest $request, int $id)
    {
        $this->service->submit($id, $request->validated());

        return response()->json(['message' => trans('admin::app.property-api.received')], 202);
    }

    public function index(Request $request)
    {
        $data = $request->validate(['property_id' => 'nullable|integer|min:1', 'per_page' => 'nullable|integer|between:1,100', 'page' => 'nullable|integer|min:1']);

        return EnquiryResource::collection($this->enquiries->listing(bouncer()->getAuthorizedUserIds(), isset($data['property_id']) ? (int) $data['property_id'] : null, $data['per_page'] ?? 20));
    }
}
