<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\StayReportRepository;
use Webkul\Property\Repositories\StayRepository;
use Webkul\Property\Support\StayDates;
use Webkul\Property\Support\StayReportCsv;

class StayReportController
{
    public function __construct(protected StayRepository $stays, protected StayReportRepository $reports) {}

    public function index(Request $request, int $id)
    {
        return response()->json($this->snapshot($request, $id))->header('Cache-Control', 'no-store');
    }

    public function export(Request $request, int $id)
    {
        $report = $this->snapshot($request, $id);
        if (StayReportCsv::rowCount($report) > StayReportCsv::MAX_ROWS) {
            throw ValidationException::withMessages(['export' => trans('admin::app.stay-api.report-export-limit')]);
        }

        return response()->streamDownload(function () use ($report) {
            $stream = fopen('php://output', 'w');
            StayReportCsv::write($stream, $report);
            fclose($stream);
        }, 'sda-stay-report-'.$id.'-'.$report['context']['from'].'-'.$report['context']['to'].'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    protected function snapshot(Request $request, int $id): array
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

            return $this->reports->report($stay, $data['from'], $data['to']);
        });
    }
}
