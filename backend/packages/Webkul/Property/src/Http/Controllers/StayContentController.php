<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Http\Resources\PublicStayResource;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Services\StayContentService;

class StayContentController
{
    public function __construct(protected StayRepository $stays, protected StayContentService $content) {}

    public function index(Request $request)
    {
        $data = $request->validate(['city' => 'sometimes|string|max:100', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:50']);
        $query = $this->stays->publicQuery();
        if (isset($data['city'])) {
            $query->where('city', $data['city']);
        }

        return PublicStayResource::collection($query->orderBy('id')->paginate($data['per_page'] ?? 12)->withQueryString())->response()->header('Cache-Control', 'no-store');
    }

    public function show(int $id)
    {
        $stay = $this->stays->publicQuery()->with(['rooms' => fn ($q) => $q->where('active', true)->where('is_published', true)->orderBy('id')])->findOrFail($id);

        return (new PublicStayResource($stay))->response()->header('Cache-Control', 'no-store');
    }

    public function edit(int $id)
    {
        return response()->json(['data' => $this->stays->authorized($id)->load('rooms')])->header('Cache-Control', 'no-store');
    }

    public function save(Request $request, int $stayId, ?int $id = null)
    {
        $data = $request->validate(['description' => 'nullable|string|max:10000', 'rules' => 'nullable|string|max:5000', 'amenities' => 'sometimes|array|max:30', 'amenities.*' => 'required|string|max:80|distinct', 'is_published' => 'required|boolean', 'photos' => 'sometimes|array|max:10', 'photos.*' => 'required|image|mimes:jpg,jpeg,png,webp|max:5120', 'remove_images' => 'sometimes|array|max:10', 'remove_images.*' => 'required|string|max:255|distinct']);
        $result = $this->content->save($stayId, $id, $data, $request->file('photos', []));

        return response()->json(['data' => $result])->header('Cache-Control', 'no-store');
    }
}
