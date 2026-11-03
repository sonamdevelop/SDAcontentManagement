<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Http\Resources\StayOperationResource;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\StayOperations;

class StayOperationsController
{
    public function __construct(protected StayRepository $stays, protected StayBookingRepository $bookings) {}

    public function index(Request $request, int $id)
    {
        $data = $request->validate(['date' => 'nullable|date_format:Y-m-d', 'view' => 'sometimes|in:arrivals,departures,in_house,overdue', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);

        return DB::transaction(function () use ($id, $data) {
            $stay = $this->stays->authorized($id);
            $context = StayOperations::context($stay->timezone, $data['date'] ?? null, now());
            $view = $data['view'] ?? 'arrivals';
            $base = $this->bookings->operationsBase($stay);
            $counts = [];
            foreach (StayOperations::VIEWS as $queue) {
                $counts[$queue] = $this->bookings->operationsQueue($base, $queue, $context['date'], $context['today'])->count();
            }
            $records = $this->bookings->operationsQueue($base, $view, $context['date'], $context['today'])->orderBy($view === 'arrivals' ? 'check_in' : 'check_out')->orderBy('id')->paginate($data['per_page'] ?? 20)->withQueryString();

            return StayOperationResource::collection($records)->additional(['context' => $context + ['stay_id' => $stay->id, 'stay_name' => $stay->name, 'view' => $view, 'counts' => $counts]])->response()->header('Cache-Control', 'no-store');
        });
    }
}
