<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayCancellationRepository;
use Webkul\Property\Services\StayCancellationService;
use Webkul\Property\Support\StayCancellation;

class StayCancellationController
{
    public function __construct(protected StayCancellationService $service, protected StayCancellationRepository $requests, protected StayBookingRepository $bookings) {}

    private function json(array $data, int $status = 200)
    {
        return response()->json($data, $status)->header('Cache-Control', 'no-store');
    }

    public function store(Request $r, int $id)
    {
        $data = $r->validate(['request_id' => 'required|uuid', 'reason' => 'required|string|max:1000', 'customer_id' => 'prohibited', 'status' => 'prohibited', 'decision_reason' => 'prohibited', 'decided_by' => 'prohibited']);
        [$row,$created] = $this->service->request($r->user()->id, $id, $data);

        return $this->json(['data' => StayCancellation::view($row)], $created ? 201 : 200);
    }

    public function index(Request $r)
    {
        $filters = $r->validate(['status' => 'sometimes|in:pending,approved,rejected,closed', 'booking_id' => 'sometimes|integer|min:1', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $page = $this->requests->queue($this->bookings->scopedQuery(), $filters);

        return $this->json(['data' => $page->getCollection()->map(fn ($row) => StayCancellation::view($row) + ['stay_name' => $row->stay_name, 'room_name' => $row->room_name, 'check_in' => $row->check_in, 'check_out' => $row->check_out, 'timezone' => $row->timezone]), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
    }

    public function decision(Request $r, int $id)
    {
        $data = $r->validate(['decision' => 'required|in:approve,reject', 'decision_reason' => 'required|string|max:1000']);

        return $this->json(['data' => StayCancellation::view($this->service->decision($id, $data['decision'], $data['decision_reason']))]);
    }
}
