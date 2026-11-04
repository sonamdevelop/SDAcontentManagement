<?php

use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Lead\Models\Lead;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\SiteVisit;
use Webkul\Property\Services\ReportService;
use Webkul\User\Models\Group;

uses(DatabaseTransactions::class);

function exportLead($owner, string $created = '2026-06-10 12:00:00')
{
    $pipeline = securityTestPipeline();

    return tap(Lead::create(['title' => 'Private CSV lead', 'user_id' => $owner->id, 'lead_pipeline_id' => $pipeline->id, 'lead_pipeline_stage_id' => $pipeline->stages()->first()->id, 'created_at' => $created]), fn ($lead) => $lead->forceFill(['created_at' => $created])->save());
}

it('uses the selected calendar timezone consistently for JSON and CSV report boundaries', function () {
    $u = apiStaff(['property-reports', 'property-reports.agents', 'leads', 'visits']);
    foreach (['2026-06-10 05:29:59', '2026-06-10 05:30:00', '2026-06-11 05:29:59', '2026-06-11 05:30:00'] as $date) {
        exportLead($u, $date);
        SiteVisit::create(['user_id' => $u->id, 'property_title' => 'Private CSV property', 'customer_name' => 'Private CSV customer', 'customer_email' => 'private-csv@example.test', 'starts_at' => $date, 'ends_at' => Carbon::parse($date)->addHour(), 'status' => 'scheduled']);
    }
    $h = apiHeaders($u);
    $query = '?from=2026-06-10&to=2026-06-10&timezone=UTC';
    $this->getJson('/api/v1/admin/reports/agents'.$query, $h)->assertOk()->assertJsonPath('data.0.leads.total', 2)->assertJsonPath('data.0.site_visits.total', 2)->assertJsonPath('meta.period.timezone', 'UTC');
    $response = $this->get('/api/v1/admin/reports/agents/export'.$query, $h)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
    expect($response->headers->get('Content-Type'))->toContain('text/csv');
    expect($response->headers->get('Content-Disposition'))->toContain('attachment;', 'sda-agent-report-');
    $stream = fopen('php://temp', 'w+');
    fwrite($stream, substr($response->streamedContent(), 3));
    rewind($stream);
    $header = fgetcsv($stream, escape: '');
    $data = array_combine($header, fgetcsv($stream, escape: ''));
    fclose($stream);
    expect($data['leads_total'])->toBe('2')->and($data['visits_total'])->toBe('2')->and($data['timezone'])->toBe('UTC');
});

it('exports all matching group agents beyond the displayed page while preserving staff and source scope', function () {
    $u = apiStaff(['property-reports', 'property-reports.agents', 'leads'], 'group');
    $a = apiStaff();
    $b = apiStaff();
    $b->update(['status' => false]);
    $outsider = apiStaff();
    foreach ([$a, $b, $outsider] as $agent) {
        exportLead($agent);
    }
    $group = Group::create(['name' => 'CSV report group']);
    $group->users()->attach([$u->id, $a->id, $b->id]);
    $h = apiHeaders($u, ['reports:read', 'leads:read']);
    $this->getJson('/api/v1/admin/reports/agents?per_page=1', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2);
    $csv = $this->get('/api/v1/admin/reports/agents/export?per_page=1&page=99', $h)->assertOk()->streamedContent();
    expect($csv)->not->toContain('visits_total', 'Private CSV lead', '@example.com');
    $stream = fopen('php://temp', 'w+');
    fwrite($stream, substr($csv, 3));
    rewind($stream);
    $header = fgetcsv($stream, escape: '');
    $rows = [];
    while (($cells = fgetcsv($stream, escape: '')) !== false) {
        $rows[] = array_combine($header, $cells);
    }
    fclose($stream);
    expect(array_column($rows, 'agent_id'))->toBe([(string) $a->id, (string) $b->id])->and($rows[1]['active'])->toBe('no');
});

it('retains own scope and excludes inaccessible users and modules from exports', function () {
    $u = apiStaff([], all: true);
    $other = apiStaff();
    exportLead($u);
    exportLead($other);
    $csv = $this->get('/api/v1/admin/reports/agents/export?user_id='.$other->id, apiHeaders($u))->assertOk()->streamedContent();
    expect(substr_count($csv, "\r\n"))->toBe(1);
    $none = apiStaff(['property-reports', 'property-reports.agents']);
    $this->get('/api/v1/admin/reports/agents/export', apiHeaders($none))->assertForbidden();
    $this->get('/api/v1/admin/reports/agents/export', apiHeaders($u, ['reports:read']))->assertForbidden();
    $this->get('/api/v1/admin/reports/agents/export', apiHeaders($u, ['leads:read']))->assertForbidden();
    $this->get('/api/v1/admin/reports/agents/export')->assertUnauthorized();
    $customer = Customer::create(['name' => 'CSV customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $this->get('/api/v1/admin/reports/agents/export', ['Authorization' => 'Bearer '.$customer->createToken('wrong report domain', ['*'])->plainTextToken])->assertUnauthorized();
});

it('neutralizes formula-bearing agent names and never includes private source data', function () {
    $u = apiStaff(['property-reports', 'property-reports.agents', 'leads']);
    $u->update(['name' => '=HYPERLINK("https://example.test")']);
    exportLead($u);
    $csv = $this->get('/api/v1/admin/reports/agents/export', apiHeaders($u))->assertOk()->streamedContent();
    expect($csv)->toContain("'=HYPERLINK")->not->toContain($u->email, 'Private CSV lead', 'customer_email');
});

it('rejects invalid timezones and oversized exports before attachment headers start', function () {
    $u = apiStaff(['property-reports', 'property-reports.agents', 'leads']);
    $h = apiHeaders($u);
    $mock = Mockery::mock(ReportService::class)->makePartial();
    $mock->shouldReceive('agentsExport')->once()->andReturn(collect(array_fill(0, 5001, new stdClass)));
    $this->instance(ReportService::class, $mock);
    foreach (['overview', 'agents', 'agents/export'] as $path) {
        $this->getJson('/api/v1/admin/reports/'.$path.'?timezone=Invalid%2FZone', $h)->assertUnprocessable()->assertJsonValidationErrors('timezone');
    }
    $this->get('/api/v1/admin/reports/agents/export', $h)->assertUnprocessable()->assertJsonValidationErrors('export')->assertHeaderMissing('Content-Disposition');
});
