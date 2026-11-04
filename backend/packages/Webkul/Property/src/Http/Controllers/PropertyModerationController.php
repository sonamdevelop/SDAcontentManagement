<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Repositories\PropertyModerationRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Services\PropertyModerationService;

class PropertyModerationController
{
    public function __construct(protected PropertyRepository $properties, protected PropertyModerationRepository $events, protected PropertyModerationService $service) {}

    private function json(array $data)
    {
        return response()->json($data)->header('Cache-Control', 'no-store');
    }

    public function index(Request $r)
    {
        $f = $r->validate(['status' => 'sometimes|in:pending,approved,rejected', 'property_id' => 'sometimes|integer|min:1', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $q = $this->properties->getModel()->newQuery();
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $q->whereIn('user_id', $ids);
        }if (isset($f['property_id'])) {
            $q->whereKey($f['property_id']);
        }$page = $q->where('moderation_status', $f['status'] ?? 'pending')->orderByDesc('id')->paginate($f['per_page'] ?? 20);

        return $this->json(['data' => $page->getCollection()->map(fn ($p) => ['id' => $p->id, 'title' => $p->title, 'city' => $p->city, 'price' => $p->price, 'currency' => config('app.currency'), 'status' => $p->status, 'is_published' => $p->is_published, 'moderation_status' => $p->moderation_status, 'moderation_revision' => $p->moderation_revision, 'moderation_reason' => $p->moderation_reason]), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    public function show(int $id)
    {
        return DB::transaction(function () use ($id) {
            $p = $this->properties->authorized($id, true);

            return $this->json(['data' => $this->events->view($p)]);
        });
    }

    public function decide(Request $r, int $id)
    {
        $d = $r->validate(['expected_revision' => 'required|integer|min:1|max:4294967294', 'decision' => 'required|in:approved,rejected', 'reason' => 'required|string|max:1000']);
        $d['expected_revision'] = (int) $d['expected_revision'];

        return $this->json(['data' => $this->service->decide($id, $d)]);
    }

    public function submit(Request $r, int $id)
    {
        $d = $r->validate(['expected_revision' => 'required|integer|min:1|max:4294967294', 'reason' => 'required|string|max:1000']);
        $d['expected_revision'] = (int) $d['expected_revision'];

        return $this->json(['data' => $this->service->submit($id, $d)]);
    }
}
