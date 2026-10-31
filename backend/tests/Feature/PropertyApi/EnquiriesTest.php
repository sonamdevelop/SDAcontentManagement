<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Webkul\Contact\Models\Person;
use Webkul\Lead\Models\Lead;
use Webkul\Lead\Repositories\PipelineRepository;
use Webkul\Property\Models\Enquiry;
use Webkul\Property\Repositories\EnquiryRepository;
use Webkul\Property\Services\EnquiryService;

uses(DatabaseTransactions::class);
beforeEach(function () {
    securityTestPipeline();
});
it('creates a contact CRM lead notification and scoped enquiry from a stateless public request', function () {
    $owner = apiStaff([], all: true);
    $p = apiProperty($owner, ['price' => '9999999999999.99']);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry(['user_id' => 9999, 'person_id' => 9999, 'email_id' => 9999, 'lead_value' => 9999999999999]))->assertStatus(202)->assertExactJson(['message' => trans('admin::app.property-api.received')]);
    $e = Enquiry::sole();
    $lead = $e->lead;
    expect($e->email)->toBe('asha@example.com')->and($e->user_id)->toBe($owner->id)->and($e->consented_at)->not->toBeNull();
    expect($lead->user_id)->toBe($owner->id)->and($lead->person->user_id)->toBe($owner->id)->and((float) $lead->lead_value)->toBe(0.0)->and($lead->description)->toContain('Please arrange a site visit.');
    $this->assertDatabaseHas('notifications', ['entity_type' => 'lead', 'entity_id' => $lead->id, 'user_id' => $owner->id]);
});
it('is idempotent for the same submission and rejects changed details', function () {
    $p = apiProperty(apiStaff([], all: true));
    $data = apiEnquiry();
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', $data)->assertStatus(202);
    $leadCount = Lead::count();
    $personCount = Person::count();
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', $data)->assertStatus(202);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', array_replace($data, ['email' => 'different@example.com']))->assertUnprocessable()->assertJsonValidationErrors('submission_id');
    expect(Enquiry::count())->toBe(1)->and(Lead::count())->toBe($leadCount)->and(Person::count())->toBe($personCount);
});
it('requires a published available enquiry-enabled property', function ($changes) {
    $p = apiProperty(apiStaff(), $changes);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry())->assertNotFound();
    expect(Enquiry::count())->toBe(0);
})->with([[['is_published' => false]], [['accepts_enquiries' => false]], [['status' => 'sold']], [['status' => 'rented']], [['status' => 'unavailable']]]);
it('rejects enquiries assigned to disabled agents', function () {
    $owner = apiStaff();
    $p = apiProperty($owner);
    $owner->update(['status' => 0]);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry())->assertNotFound();
});
it('validates customer input and consent before contact or lead creation', function ($changes, $field) {
    $p = apiProperty(apiStaff());
    $leads = Lead::count();
    $persons = Person::count();
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry($changes))->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(Enquiry::count())->toBe(0)->and(Lead::count())->toBe($leads)->and(Person::count())->toBe($persons);
})->with([
    [['name' => ''], 'name'], [['name' => ['bad']], 'name'], [['email' => 'bad'], 'email'], [['email' => ['a@example.com']], 'email'],
    [['phone' => '<script>'], 'phone'], [['message' => ''], 'message'], [['message' => str_repeat('a', 5001)], 'message'], [['consent' => false], 'consent'],
    [['submission_id' => 'invalid'], 'submission_id'], [['name' => '{{constructor}}'], 'name'], [['message' => '{{constructor}}'], 'message'],
]);
it('reuses only the assigned agents contact and never overwrites existing contact details', function () {
    $owner = apiStaff();
    $other = apiStaff();
    $p = apiProperty($owner);
    $private = Person::create(['name' => 'Other private contact', 'emails' => [['value' => 'asha@example.com', 'label' => 'work']], 'user_id' => $other->id]);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry())->assertStatus(202);
    $person = Enquiry::first()->lead->person;
    expect($person->id)->not->toBe($private->id);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry(['name' => 'Changed name']))->assertStatus(202);
    expect(Enquiry::latest('id')->first()->lead->person_id)->toBe($person->id)->and($person->fresh()->name)->toBe('Asha Rao');
});
it('scopes enquiry history and never returns idempotency secrets', function () {
    $owner = apiStaff(['properties.enquiries']);
    $other = apiStaff(['properties.enquiries']);
    $p = apiProperty($owner);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry())->assertStatus(202);
    $this->getJson('/api/v1/admin/enquiries', apiHeaders($owner))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.email', 'asha@example.com')->assertJsonMissingPath('data.0.submission_id')->assertJsonMissingPath('data.0.payload_hash');
    $this->getJson('/api/v1/admin/enquiries?property_id='.$p->id, apiHeaders($other))->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/admin/enquiries', apiHeaders(apiStaff(['properties'])))->assertForbidden();
    $this->getJson('/api/v1/admin/enquiries')->assertUnauthorized();
});
it('preserves enquiry history and CRM lead when a property is removed', function () {
    $owner = apiStaff([], all: true);
    $p = apiProperty($owner);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry())->assertStatus(202);
    $e = Enquiry::sole();
    $this->deleteJson('/api/v1/admin/properties/'.$p->id, [], apiHeaders($owner))->assertNoContent();
    expect($e->fresh()->property_id)->toBeNull()->and($e->fresh()->lead_id)->not->toBeNull();
    $this->getJson('/api/v1/admin/enquiries', apiHeaders($owner))->assertOk()->assertJsonPath('data.0.property_title', 'River view apartment');
});
it('rolls back a created contact and lead when enquiry persistence fails', function () {
    $p = apiProperty(apiStaff());
    $leads = Lead::count();
    $persons = Person::count();
    $repo = Mockery::mock(EnquiryRepository::class)->makePartial();
    $repo->shouldReceive('findOneWhere')->andReturn(null);
    $repo->shouldReceive('create')->andThrow(new RuntimeException('Failure'));
    app()->instance(EnquiryRepository::class, $repo);
    expect(fn () => app(EnquiryService::class)->submit($p->id, apiEnquiry()))->toThrow(RuntimeException::class);
    expect(Lead::count())->toBe($leads)->and(Person::count())->toBe($persons)->and(Enquiry::count())->toBe(0);
});
it('handles missing pipeline configuration without partial writes', function () {
    $p = apiProperty(apiStaff());
    $repo = Mockery::mock(PipelineRepository::class)->makePartial();
    $repo->shouldReceive('getDefaultPipeline')->andReturn(null);
    app()->instance(PipelineRepository::class, $repo);
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', apiEnquiry())->assertStatus(503);
    expect(Enquiry::count())->toBe(0);
});
it('limits anonymous enquiry submissions across retries', function () {
    $p = apiProperty(apiStaff());
    $data = apiEnquiry();
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', $data)->assertStatus(202);
    }
    $this->postJson('/api/v1/properties/'.$p->id.'/enquiries', $data)->assertStatus(429);
    expect(Enquiry::count())->toBe(1);
});
