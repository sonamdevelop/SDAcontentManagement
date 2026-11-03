<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayPaymentRepository;
use Webkul\Property\Support\CustomerStayBookingView;

class CustomerStayBookingController
{
    public function __construct(protected StayBookingRepository $bookings, protected StayPaymentRepository $payments) {}

    public function index(Request $request)
    {
        $data = $request->validate(['status' => 'sometimes|in:confirmed,cancelled', 'page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);

        return DB::transaction(function () use ($request, $data) {
            $query = $this->bookings->forCustomer($request->user()->id);
            if (isset($data['status'])) {
                $query->where('status', $data['status']);
            }
            $page = $query->orderByDesc('id')->paginate($data['per_page'] ?? 20)->withQueryString();
            $this->payments->prime($page->getCollection());
            $page->setCollection($page->getCollection()->map(fn ($b) => CustomerStayBookingView::make($b->toArray(), $b->ledger_snapshot)));

            return response()->json(['data' => $page->items(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total()]]);
        });
    }

    public function show(Request $request, int $id)
    {
        return DB::transaction(function () use ($request, $id) {
            $booking = $this->bookings->forCustomer($request->user()->id)->lockForUpdate()->findOrFail($id);

            return response()->json(['data' => CustomerStayBookingView::make($booking->toArray(), $this->payments->summary($booking, true))]);
        });
    }
}
