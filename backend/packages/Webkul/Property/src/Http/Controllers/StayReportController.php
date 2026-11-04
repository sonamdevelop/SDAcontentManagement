<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\StayReportRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\StayDates;

class StayReportController
{
    public function __construct(protected StayRepository $stays, protected StayReportRepository $reports) {}

    public function index(Request $request, int $id)
    {
        $data = $request->validate(['from' => 'required|date_format:Y-m-d|after_or_equal:1000-01-01|before:9999-01-01', 'to' => 'required|date_format:Y-m-d|after:from|before:9999-01-01']);
        try {
            if (StayDates::nights($data['from'], $data['to']) > 62) {
                throw new \InvalidArgumentException;
            }
        } catch (\InvalidArgumentException) {
            throw ValidationException::withMessages(['to' => trans('admin::app.stay-api.report-range')]);
        }

        return DB::transaction(function () use ($data, $id) {
            $stay = $this->stays->authorized($id);

            return response()->json($this->reports->report($stay, $data['from'], $data['to']))->header('Cache-Control', 'no-store');
        });
    }
}
