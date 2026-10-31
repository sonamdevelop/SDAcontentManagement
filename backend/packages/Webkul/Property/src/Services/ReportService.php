<?php

namespace Webkul\Property\Services;

use Illuminate\Http\Request;
use Webkul\Activity\Repositories\ActivityRepository;
use Webkul\Property\Repositories\EnquiryRepository;
use Webkul\Property\Repositories\LeadApiRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Repositories\SiteVisitRepository;
use Webkul\Property\Support\ReportPeriod;
use Webkul\User\Repositories\UserRepository;

class ReportService
{
    public function __construct(
        protected PropertyRepository $properties,
        protected EnquiryRepository $enquiries,
        protected LeadApiRepository $leads,
        protected ActivityRepository $activities,
        protected SiteVisitRepository $visits,
        protected UserRepository $users,
    ) {}

    /** Reports require both report access and each source module's ACL/token ability. */
    public function sections(Request $request): array
    {
        $sources = [
            'properties' => ['properties', 'properties:read'],
            'enquiries' => ['properties.enquiries', 'enquiries:read'],
            'leads' => ['leads', 'leads:read'],
            'follow_ups' => ['leads.view', 'leads:read'],
            'site_visits' => ['visits', 'visits:read'],
        ];

        return array_keys(array_filter($sources, fn ($source) => bouncer()->hasPermission($source[0]) && $request->user()->currentAccessToken()->can($source[1])));
    }

    public function overview(array $filters, ReportPeriod $period, array $sections, string $asOf): array
    {
        $data = array_fill_keys(['properties', 'enquiries', 'leads', 'follow_ups', 'site_visits'], null);
        if (in_array('properties', $sections, true)) {
            $query = $period->apply($this->scoped($this->properties, 'properties', $filters), 'properties.created_at');
            $data['properties'] = $this->counts($query, $this->statuses('status', ['available', 'reserved', 'sold', 'rented', 'unavailable']));
        }
        if (in_array('enquiries', $sections, true)) {
            $query = $period->apply($this->scoped($this->enquiries, 'property_enquiries', $filters), 'property_enquiries.created_at');
            $data['enquiries'] = $this->counts($query, ['linked_to_lead' => ['lead_id IS NOT NULL', []], 'without_lead' => ['lead_id IS NULL', []]]);
        }
        if (in_array('leads', $sections, true)) {
            $data['leads'] = $this->counts($this->leadQuery($filters, $period), $this->leadConditions());
        }
        if (in_array('follow_ups', $sections, true)) {
            // EXISTS counts a shared activity once, and follows the visible lead's current owner.
            $visible = $this->scoped($this->leads, 'leads', $filters)->select('leads.id');
            $query = $this->activities->getModel()->newQuery()->where('type', 'task')
                ->whereHas('leads', fn ($query) => $query->whereIn('leads.id', $visible));
            $period->apply($query, 'activities.schedule_to');
            $data['follow_ups'] = $this->counts($query, [
                'pending' => ['is_done = 0', []], 'done' => ['is_done = 1', []],
                'overdue' => ['is_done = 0 AND schedule_to < ?', [$asOf]],
                'undated' => ['schedule_to IS NULL', []],
            ]);
        }
        if (in_array('site_visits', $sections, true)) {
            $data['site_visits'] = $this->counts($this->visitQuery($filters, $period), $this->visitConditions($asOf));
        }

        return $data;
    }

    public function agents(array $filters, ReportPeriod $period, array $sections, string $asOf)
    {
        $hasLeads = in_array('leads', $sections, true);
        $hasVisits = in_array('site_visits', $sections, true);
        abort_unless($hasLeads || $hasVisits, 403);
        $query = $this->scoped($this->users, 'users', $filters, 'id')->select(['users.id', 'users.name', 'users.status']);
        $totals = [];
        foreach (['leads' => $hasLeads, 'visits' => $hasVisits] as $domain => $allowed) {
            if (! $allowed) {
                continue;
            }
            $source = $domain === 'leads' ? $this->leadQuery($filters, $period) : $this->visitQuery($filters, $period);
            $conditions = $domain === 'leads' ? $this->leadConditions() : $this->visitConditions($asOf);
            $table = $domain === 'leads' ? 'leads' : 'site_visits';
            $aggregate = $this->aggregate($source, $conditions)->addSelect($table.'.user_id')->groupBy($table.'.user_id');
            $query->leftJoinSub($aggregate, 'report_'.$domain, 'report_'.$domain.'.user_id', '=', 'users.id');
            foreach (array_merge(['total'], array_keys($conditions)) as $field) {
                $query->selectRaw('COALESCE(report_'.$domain.'.'.$field.', 0) AS '.$domain.'_'.$field);
            }
            $totals[] = 'report_'.$domain.'.total';
        }
        // Return agents with matching records only; never expose an unrelated staff directory.
        $query->where(function ($query) use ($totals) {
            foreach ($totals as $column) {
                $query->orWhere($column, '>', 0);
            }
        });

        return $query->orderBy('users.id')->paginate($filters['per_page'] ?? 20)->withQueryString();
    }

    protected function scoped($repository, string $table, array $filters, string $owner = 'user_id')
    {
        $query = $repository->getModel()->newQuery();
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $query->whereIn($table.'.'.$owner, $ids);
        }
        if (isset($filters['user_id'])) {
            $query->where($table.'.'.$owner, $filters['user_id']);
        }

        return $query;
    }

    protected function leadQuery(array $filters, ReportPeriod $period)
    {
        return $period->apply($this->scoped($this->leads, 'leads', $filters), 'leads.created_at')
            ->leftJoin('lead_pipeline_stages as report_stages', 'report_stages.id', '=', 'leads.lead_pipeline_stage_id');
    }

    protected function visitQuery(array $filters, ReportPeriod $period)
    {
        return $period->apply($this->scoped($this->visits, 'site_visits', $filters), 'site_visits.starts_at');
    }

    protected function leadConditions(): array
    {
        return [
            'open' => ["report_stages.code NOT IN ('won', 'lost')", []],
            'won' => ['report_stages.code = ?', ['won']],
            'lost' => ['report_stages.code = ?', ['lost']],
            'unclassified' => ['report_stages.code IS NULL', []],
        ];
    }

    protected function visitConditions(string $asOf): array
    {
        return array_merge($this->statuses('site_visits.status', ['scheduled', 'completed', 'cancelled', 'no_show']), [
            'upcoming' => ['site_visits.status = ? AND starts_at >= ?', ['scheduled', $asOf]],
        ]);
    }

    protected function statuses(string $column, array $values): array
    {
        return array_combine($values, array_map(fn ($value) => [$column.' = ?', [$value]], $values));
    }

    protected function aggregate($query, array $conditions)
    {
        $query = $query->toBase()->selectRaw('COUNT(*) AS total');
        foreach ($conditions as $key => [$condition, $bindings]) {
            $query->selectRaw('COALESCE(SUM(CASE WHEN '.$condition.' THEN 1 ELSE 0 END), 0) AS '.$key, $bindings);
        }

        return $query;
    }

    protected function counts($query, array $conditions): array
    {
        return array_map(fn ($value) => (int) $value, (array) $this->aggregate($query, $conditions)->first());
    }
}
