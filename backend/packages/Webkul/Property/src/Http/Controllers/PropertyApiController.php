<?php

namespace Webkul\Property\Http\Controllers;

use Webkul\Property\Http\Requests\PropertyFilters;
use Webkul\Property\Http\Requests\PropertyRequest;
use Webkul\Property\Http\Resources\AdminPropertyResource;
use Webkul\Property\Http\Resources\PublicPropertyResource;
use Webkul\Property\Repositories\PropertyRepository;

class PropertyApiController
{
    public function __construct(protected PropertyRepository $properties) {}

    public function index(PropertyFilters $request)
    {
        return PublicPropertyResource::collection($this->properties->listing($request->validated(), null, true));
    }

    public function show(int $id)
    {
        return new PublicPropertyResource($this->properties->findPublic($id));
    }

    public function adminIndex(PropertyFilters $request)
    {
        return AdminPropertyResource::collection($this->properties->listing($request->validated(), bouncer()->getAuthorizedUserIds()));
    }

    public function adminShow(int $id)
    {
        return new AdminPropertyResource($this->properties->authorized($id));
    }

    public function store(PropertyRequest $request)
    {
        $data = $request->safe()->except(['photos', 'remove_images']);
        $data['user_id'] = $request->user()->id;
        $p = $this->properties->saveProperty($data, $request->file('photos', []));

        return (new AdminPropertyResource($p->refresh()))->response()->setStatusCode(201);
    }

    public function update(PropertyRequest $request, int $id)
    {
        $p = $this->properties->authorized($id);
        $data = $request->safe()->except(['photos', 'remove_images']);
        $saved = $this->properties->saveProperty($data, $request->file('photos', []), $request->validated('remove_images') ?? [], $p);

        return new AdminPropertyResource($saved->refresh());
    }

    public function destroy(int $id)
    {
        $this->properties->deleteProperty($this->properties->authorized($id));

        return response()->noContent();
    }
}
