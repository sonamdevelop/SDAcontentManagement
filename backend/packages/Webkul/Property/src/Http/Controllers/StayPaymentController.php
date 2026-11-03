<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Http\Resources\StayPaymentResource;
use Webkul\Property\Repositories\StayBookingRepository;
use Webkul\Property\Repositories\StayPaymentRepository;
use Webkul\Property\Services\StayPaymentService;
use Webkul\Property\Support\DealMoney;

class StayPaymentController
{
    public function __construct(protected StayBookingRepository $bookings, protected StayPaymentRepository $payments, protected StayPaymentService $service) {}

    public function index(Request $request, int $id)
    {
        $data = $request->validate(['page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);

        return DB::transaction(function () use ($id, $data) {
            $booking = $this->bookings->authorized($id, true);

            return StayPaymentResource::collection($this->payments->page($id, $data['per_page'] ?? 20))->additional(['summary' => $this->summary($booking)])->response()->header('Cache-Control', 'no-store');
        });
    }

    private function summary($booking, ?array $totals = null)
    {
        return ($totals ?? $this->payments->summary($booking, true)) + ['total' => $booking->total, 'advance' => $booking->advance, 'currency' => $booking->currency, 'status' => $booking->status];
    }

    public function payment(Request $request, int $id)
    {
        return $this->save($request, $id, 'payment');
    }

    public function refund(Request $request, int $id)
    {
        return $this->save($request, $id, 'refund');
    }

    public function reverse(Request $request, int $id, int $entryId)
    {
        return $this->save($request, $id, 'reversal', $entryId);
    }

    private function save(Request $request, int $id, string $kind, ?int $entryId = null)
    {
        $rules = ['request_id' => 'required|uuid', 'reason' => ($kind === 'payment' ? 'nullable' : 'required').'|string|max:1000'];
        if ($kind !== 'reversal') {
            $rules += ['amount' => ['required', 'string', 'regex:'.DealMoney::PATTERN], 'method' => 'required|in:cash,upi,bank_transfer,card,other', 'reference' => 'nullable|string|max:190'];
        }
        [$entry,$booking,$created,$totals] = $this->service->record($id, $kind, $request->validate($rules), $entryId);

        return (new StayPaymentResource($entry))->additional(['summary' => $this->summary($booking, $totals)])->response()->setStatusCode($created ? 201 : 200)->header('Cache-Control','no-store');
    }
}
