<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Http\Resources\StayPaymentFollowUpResource;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayPaymentRepository;
use Webkul\Property\Repositories\StayRepository;

class StayPaymentFollowUpController
{
    public function __construct(protected StayRepository $stays, protected StayBookingRepository $bookings, protected StayPaymentRepository $payments) {}

    public function index(Request $request, int $id)
    {
        $data = $request->validate(['view' => 'sometimes|in:collection,refund', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);

        return DB::transaction(function () use ($id, $data) {
            $stay = $this->stays->authorized($id);
            $view = $data['view'] ?? 'collection';
            $queues = [];
            $counts = [];
            foreach (['collection', 'refund'] as $queue) {
                $queues[$queue] = $this->bookings->paymentFollowUps($stay, $queue, $this->payments->effectiveTotals());
                $counts[$queue] = (clone $queues[$queue])->count();
            }
            $records = $queues[$view]->orderBy('check_in')->orderBy('stay_bookings.id')->paginate($data['per_page'] ?? 20)->withQueryString();

            return StayPaymentFollowUpResource::collection($records)->additional(['context' => ['stay_id' => $stay->id, 'stay_name' => $stay->name, 'view' => $view, 'as_of' => now()->toIso8601String(), 'counts' => $counts]])->response()->header('Cache-Control', 'no-store');
        });
    }
}
