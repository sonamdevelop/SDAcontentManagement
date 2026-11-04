<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Http\Requests\ReportFilters;
use Webkul\Property\Http\Resources\AgentReportResource;
use Webkul\Property\Services\ReportService;
use Webkul\Property\Support\AgentReportCsv;
use Webkul\Property\Support\ReportPeriod;

class ReportApiController
{
    public function __construct(protected ReportService $reports) {}

    public function overview(ReportFilters $request)
    {
        [$filters, $period, $sections, $asOf] = $this->context($request);
        $data = DB::transaction(fn () => $this->reports->overview($filters, $period, $sections, $asOf->format('Y-m-d H:i:s')));

        return response()->json(['data' => $data, 'meta' => $this->meta($filters, $period, $sections, $asOf)])->header('Cache-Control', 'no-store');
    }

    public function agents(ReportFilters $request)
    {
        [$filters, $period, $sections, $asOf] = $this->context($request);
        $sections = array_values(array_intersect($sections, ['leads', 'site_visits']));
        $page = DB::transaction(fn () => $this->reports->agents($filters, $period, $sections, $asOf->format('Y-m-d H:i:s')));

        return AgentReportResource::collection($page)->additional(['meta' => $this->meta($filters, $period, $sections, $asOf)])
            ->response()->header('Cache-Control', 'no-store');
    }

    public function export(ReportFilters $request)
    {
        [$filters, $period, $sections, $asOf] = $this->context($request);
        $sections = array_values(array_intersect($sections, ['leads', 'site_visits']));
        $rows = DB::transaction(fn () => $this->reports->agentsExport($filters, $period, $sections, $asOf->format('Y-m-d H:i:s')));
        if ($rows->count() > AgentReportCsv::MAX_ROWS) {
            throw ValidationException::withMessages(['export' => trans('admin::app.agent-report.export-limit')]);
        }
        $rows = $rows->map(fn ($row) => (new AgentReportResource($row))->resolve($request))->all();
        $meta = $this->meta($filters, $period, $sections, $asOf);

        return response()->streamDownload(function () use ($rows, $meta, $sections) {
            $stream = fopen('php://output', 'w');
            AgentReportCsv::write($stream, $rows, $meta, $sections);
            fclose($stream);
        }, 'sda-agent-report-'.$asOf->format('Y-m-d').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'no-store', 'X-Content-Type-Options' => 'nosniff']);
    }

    protected function context(ReportFilters $request): array
    {
        $filters = $request->validated();
        $period = new ReportPeriod($filters['from'] ?? null, $filters['to'] ?? null, $filters['timezone'] ?? config('app.timezone'), config('app.timezone'));

        return [$filters, $period, $this->reports->sections($request), now()->startOfSecond()];
    }

    protected function meta(array $filters, ReportPeriod $period, array $sections, $asOf): array
    {
        return ['period' => $period->toArray(), 'user_id' => isset($filters['user_id']) ? (int) $filters['user_id'] : null,
            'as_of' => $asOf->toIso8601String(), 'available_sections' => $sections];
    }
}
