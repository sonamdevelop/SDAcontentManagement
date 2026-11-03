<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Http\Resources\StayBookingResource;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Services\StayBookingService;
use Webkul\Property\Support\DealMoney;

class StayApiController
{
    public function __construct(protected StayRepository $stays, protected StayBookingRepository $bookings, protected StayBookingService $service) {}

    protected function json($data, int $code = 200)
    {
        return response()->json(['data' => $data], $code)->header('Cache-Control', 'no-store');
    }

    protected function filters(Request $r): array
    {
        return $r->validate(['page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100', 'stay_id' => 'sometimes|integer|min:1', 'room_type_id' => 'sometimes|integer|min:1', 'status' => 'sometimes|in:confirmed,cancelled', 'attendance_status' => 'sometimes|in:not_arrived,checked_in,checked_out']);
    }

    public function stays(Request $r)
    {
        $f = $this->filters($r);

        return JsonResource::collection($this->stays->scopedQuery()->with('rooms')->latest('id')->paginate($f['per_page'] ?? 20)->withQueryString())->response()->header('Cache-Control', 'no-store');
    }

    public function stay(Request $r, ?int $id = null)
    {
        $data = $r->validate(['name' => 'required|string|max:255', 'city' => 'required|string|max:100', 'timezone' => 'required|timezone:all', 'active' => 'required|boolean']);

        return $this->json($this->service->saveStay($data, $id), $id ? 200 : 201);
    }

    public function room(Request $r, int $stayId, ?int $id = null)
    {
        $data = $r->validate(['name' => 'required|string|max:255', 'inventory' => 'required|integer|min:1|max:1000', 'capacity' => 'required|integer|min:1|max:100', 'nightly_rate' => ['required', 'string', 'regex:'.DealMoney::PATTERN], 'active' => 'required|boolean']);
        $data['inventory'] = (int) $data['inventory'];
        $data['capacity'] = (int) $data['capacity'];

        return $this->json($this->service->saveRoom($stayId, $data, $id), $id ? 200 : 201);
    }

    public function availability(Request $r, int $id)
    {
        return $this->json($this->service->availability($id, $r->validate(['check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d'])));
    }

    public function index(Request $r)
    {
        $f = $this->filters($r);
        $q = $this->bookings->scopedQuery();
        foreach (['room_type_id', 'status'] as $k) {
            if (isset($f[$k])) {
                $q->where($k, $f[$k]);
            }
        }

        if (isset($f['attendance_status'])) {
            match ($f['attendance_status']) {
                'not_arrived' => $q->whereNull('checked_in_at')->whereNull('checked_out_at'),
                'checked_in' => $q->whereNotNull('checked_in_at')->whereNull('checked_out_at'),
                'checked_out' => $q->whereNotNull('checked_out_at'),
            };
        }

        return StayBookingResource::collection($q->latest('id')->paginate($f['per_page'] ?? 20)->withQueryString())->response()->header('Cache-Control', 'no-store');
    }

    public function show(int $id)
    {
        return (new StayBookingResource($this->bookings->authorized($id)->load('events')))->response()->header('Cache-Control', 'no-store');
    }

    public function store(Request $r)
    {
        $data = $r->validate(['request_id' => 'required|uuid', 'room_type_id' => 'required|integer|min:1', 'check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d', 'rooms' => 'required|integer|min:1|max:1000', 'guests' => 'required|integer|min:1|max:10000', 'guest_name' => 'required|string|max:150', 'guest_email' => 'nullable|email|max:255', 'guest_phone' => 'nullable|string|max:30', 'expected_rate' => ['required', 'string', 'regex:'.DealMoney::PATTERN], 'advance' => ['sometimes', 'required', 'string', 'regex:'.DealMoney::PATTERN], 'payment_reference' => 'nullable|string|max:190', 'notes' => 'nullable|string|max:5000']);
        foreach (['room_type_id', 'rooms', 'guests'] as $k) {
            $data[$k] = (int) $data[$k];
        }
        ksort($data);
        [$record, $created] = $this->service->reserve($data);

        return (new StayBookingResource($record))->response()->setStatusCode($created ? 201 : 200)->header('Cache-Control', 'no-store');
    }

    public function checkIn(int $id)
    {
        return (new StayBookingResource($this->service->attendance($id, 'check-in')))->response()->header('Cache-Control', 'no-store');
    }

    public function checkOut(int $id)
    {
        return (new StayBookingResource($this->service->attendance($id, 'check-out')))->response()->header('Cache-Control', 'no-store');
    }

    public function cancel(Request $r, int $id)
    {
        $data = $r->validate(['cancellation_reason' => 'required|string|max:1000']);

        return (new StayBookingResource($this->service->cancel($id, trim($data['cancellation_reason']))))->response()->header('Cache-Control', 'no-store');
    }
}
