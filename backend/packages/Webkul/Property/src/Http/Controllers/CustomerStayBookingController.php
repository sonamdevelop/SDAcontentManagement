<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayPaymentRepository;
use Webkul\Property\Services\CustomerReservationService;
use Webkul\Property\Support\CustomerStayBookingView;
use Webkul\Property\Support\DealMoney;

class CustomerStayBookingController
{
    public function __construct(protected StayBookingRepository $bookings, protected StayPaymentRepository $payments) {}

    public function availability(Request $request, int $id)
    {
        $data = $request->validate(['check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d']);

        return response()->json(['data' => app(CustomerReservationService::class)->availability($id, $data)]);
    }

    public function store(Request $request)
    {
        $rules = ['request_id' => 'required|uuid', 'room_type_id' => 'required|integer|min:1', 'check_in' => 'required|date_format:Y-m-d', 'check_out' => 'required|date_format:Y-m-d', 'rooms' => 'required|integer|min:1|max:1000', 'guests' => 'required|integer|min:1|max:10000', 'guest_name' => 'required|string|max:150', 'guest_phone' => 'nullable|string|max:30', 'expected_rate' => ['required', 'string', 'regex:'.DealMoney::PATTERN]];
        foreach (['customer_id', 'user_id', 'created_by', 'total', 'advance', 'currency', 'status', 'guest_email', 'notes', 'payment_reference'] as $field) {
            $rules[$field] = 'prohibited';
        }
        $data = $request->validate($rules);
        foreach (['room_type_id', 'rooms', 'guests'] as $field) {
            $data[$field] = (int) $data[$field];
        }
        [$record, $created] = app(CustomerReservationService::class)->reserve($request->user()->id, $data);

        return DB::transaction(function () use ($record, $request, $created) {
            $booking = $this->bookings->forCustomer($request->user()->id)->lockForUpdate()->findOrFail($record->id);

            return response()->json(['data' => CustomerStayBookingView::make($booking->toArray(), $this->payments->summary($booking, true))], $created ? 201 : 200);
        });
    }

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
