<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Support\Facades\DB;
use Webkul\Property\Http\Requests\ReportFilters;
use Webkul\Property\Http\Resources\AgentReportResource;
use Webkul\Property\Services\ReportService;
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

    protected function context(ReportFilters $request): array
    {
        $filters = $request->validated();
        $period = new ReportPeriod($filters['from'] ?? null, $filters['to'] ?? null, config('app.timezone'));

        return [$filters, $period, $this->reports->sections($request), now()->startOfSecond()];
    }

    protected function meta(array $filters, ReportPeriod $period, array $sections, $asOf): array
    {
        return ['period' => $period->toArray(), 'user_id' => isset($filters['user_id']) ? (int) $filters['user_id'] : null,
            'as_of' => $asOf->toIso8601String(), 'available_sections' => $sections];
    }
}
