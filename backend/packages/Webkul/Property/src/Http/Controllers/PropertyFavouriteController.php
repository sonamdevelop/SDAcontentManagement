<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Repositories\PropertyFavouriteRepository;
use Webkul\Property\Services\PropertyFavouriteService;

class PropertyFavouriteController
{
    public function __construct(protected PropertyFavouriteRepository $favourites, protected PropertyFavouriteService $service) {}

    private function json(array $data)
    {
        return response()->json($data)->header('Cache-Control', 'no-store');
    }

    public function index(Request $r)
    {
        $f = $r->validate(['page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:50']);
        $page = $this->favourites->listing($r->user()->id, $f['per_page'] ?? 12);

        return $this->json(['data' => $page->getCollection()->map(fn ($row) => $this->favourites->view($row)), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    public function status(Request $r, int $id)
    {
        return $this->json(['data' => ['property_id' => $id, 'saved' => $this->favourites->saved($r->user()->id, $id)]]);
    }

    public function store(Request $r, int $id)
    {
        $r->validate(['customer_id' => 'prohibited', 'user_id' => 'prohibited', 'property_id' => 'prohibited', 'saved' => 'prohibited']);
        $this->service->save($r->user()->id, $id);

        return $this->json(['data' => ['property_id' => $id, 'saved' => true]]);
    }

    public function destroy(Request $r, int $id)
    {
        $this->service->remove($r->user()->id, $id);

        return response()->noContent()->header('Cache-Control', 'no-store');
    }

    public function popularity(Request $r)
    {
        $f = $r->validate(['property_id' => 'sometimes|integer|min:1', 'min_count' => 'sometimes|integer|min:1|max:1000000000', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $page = $this->favourites->popularity($f);

        return $this->json(['data' => $page->getCollection()->map(fn ($p) => ['id' => $p->id, 'title' => $p->title, 'city' => $p->city, 'status' => $p->status, 'moderation_status' => $p->moderation_status, 'is_published' => $p->is_published, 'favourites_count' => (int) $p->favourites_count]), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }
}
