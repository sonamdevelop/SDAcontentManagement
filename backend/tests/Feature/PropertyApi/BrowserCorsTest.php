<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Support\DocumentFilePolicy;

uses(DatabaseTransactions::class);
beforeEach(function () {
    config(['property_api.cors.allowed_origins' => ['https://web.example.com']]);
});
it('answers a permitted preflight before authentication without enabling cookies', function () {
    $r = $this->options('/api/v1/admin/property-deals', [], ['Origin' => 'https://web.example.com', 'Access-Control-Request-Method' => 'POST', 'Access-Control-Request-Headers' => 'authorization,content-type']);
    $r->assertNoContent()->assertHeader('Access-Control-Allow-Origin', 'https://web.example.com')->assertHeaderMissing('Access-Control-Allow-Credentials');
    expect(strtolower($r->headers->get('Access-Control-Allow-Headers')))->toContain('authorization', 'content-type');
});
it('withholds browser grants for unlisted and empty origins', function () {
    $headers = ['Origin' => 'https://other.example.com', 'Access-Control-Request-Method' => 'POST'];
    $this->options('/api/v1/admin/properties', [], $headers)->assertNoContent()->assertHeaderMissing('Access-Control-Allow-Origin');
    config(['property_api.cors.allowed_origins' => []]);
    $headers['Origin'] = 'https://web.example.com';
    $this->options('/api/v1/admin/properties', [], $headers)->assertNoContent()->assertHeaderMissing('Access-Control-Allow-Origin');
});
it('adds CORS headers to successful validation and authentication responses without bypassing auth', function () {
    $h = ['Origin' => 'https://web.example.com'];
    $this->getJson('/api/v1/properties', $h)->assertOk()->assertHeader('Access-Control-Allow-Origin', $h['Origin']);
    $this->getJson('/api/v1/admin/properties', $h)->assertUnauthorized()->assertHeader('Access-Control-Allow-Origin', $h['Origin']);
    $u = apiStaff([], all: true);
    $this->postJson('/api/v1/admin/properties', [], array_merge($h, apiHeaders($u)))->assertUnprocessable()->assertHeader('Access-Control-Allow-Origin', $h['Origin']);
});
it('keeps API origin policy distinct from the legacy public web-form policy', function () {
    $this->options('/admin/web-forms/forms/123', [], ['Origin' => 'https://any.example.com', 'Access-Control-Request-Method' => 'POST'])->assertHeader('Access-Control-Allow-Origin', '*');
    $this->getJson('/api/v1/properties', ['Origin' => 'https://any.example.com'])->assertOk()->assertHeaderMissing('Access-Control-Allow-Origin');
});
it('exposes attachment filename headers while requiring a valid bearer token', function () {
    Storage::fake(DocumentFilePolicy::DISK);
    $u = apiStaff([], all: true);
    $p = apiProperty($u);
    $h = array_merge(['Origin' => 'https://web.example.com'], apiHeaders($u));
    $file = UploadedFile::fake()->createWithContent('registry.pdf', "%PDF-1.4\n%%EOF\n");
    $url = $this->post('/api/v1/admin/properties/'.$p->id.'/documents', ['title' => 'Registry', 'category' => 'registry', 'file' => $file], $h)->assertCreated()->json('data.download_url');
    $r = $this->get($url, $h)->assertOk()->assertDownload('registry.pdf')->assertHeader('Access-Control-Allow-Origin', $h['Origin']);
    expect($r->headers->get('Access-Control-Expose-Headers'))->toContain('Content-Disposition');
    $this->get($url, ['Origin' => $h['Origin']])->assertUnauthorized()->assertHeader('Access-Control-Allow-Origin', $h['Origin']);
});
