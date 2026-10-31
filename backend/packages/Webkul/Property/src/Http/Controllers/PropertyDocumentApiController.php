<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Webkul\Property\Http\Requests\PropertyDocumentRequest;
use Webkul\Property\Http\Resources\PropertyDocumentResource;
use Webkul\Property\Repositories\PropertyDocumentRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Services\PropertyDocumentService;
use Webkul\Property\Support\DocumentFilePolicy;

class PropertyDocumentApiController
{
    public function __construct(protected PropertyRepository $properties, protected PropertyDocumentRepository $documents, protected PropertyDocumentService $service) {}

    public function index(Request $request, int $propertyId)
    {
        $this->properties->authorized($propertyId);
        $filters = $request->validate(['category' => ['nullable', Rule::in(DocumentFilePolicy::CATEGORIES)], 'per_page' => 'nullable|integer|between:1,100', 'page' => 'nullable|integer|min:1']);

        return PropertyDocumentResource::collection($this->documents->listing($propertyId, $filters))->response()->header('Cache-Control', 'no-store');
    }

    public function store(PropertyDocumentRequest $request, int $propertyId)
    {
        return (new PropertyDocumentResource($this->service->upload($propertyId, $request->safe()->except('file'), $request->file('file'))))
            ->response()->setStatusCode(201)->header('Cache-Control', 'no-store');
    }

    public function download(int $propertyId, int $id)
    {
        return $this->service->download($propertyId, $id);
    }

    public function destroy(int $propertyId, int $id)
    {
        $this->service->delete($propertyId, $id);

        return response()->noContent()->header('Cache-Control', 'no-store');
    }
}
