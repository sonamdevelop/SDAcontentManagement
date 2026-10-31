<?php

namespace Webkul\Property\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Webkul\Admin\Services\NotificationService;
use Webkul\Contact\Repositories\PersonRepository;
use Webkul\Lead\Repositories\LeadRepository;
use Webkul\Lead\Repositories\PipelineRepository;
use Webkul\Lead\Repositories\StageRepository;
use Webkul\Property\Repositories\EnquiryRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Support\EnquiryDetails;
use Webkul\User\Repositories\UserRepository;

class EnquiryService
{
    public function __construct(protected PropertyRepository $properties, protected EnquiryRepository $enquiries, protected PersonRepository $persons, protected LeadRepository $leads, protected PipelineRepository $pipelines, protected StageRepository $stages, protected UserRepository $users) {}

    public function submit(int $id, array $data)
    {
        return DB::transaction(function () use ($id, $data) {
            $property = $this->properties->getModel()->newQuery()->lockForUpdate()->findOrFail($id);
            abort_unless($property->is_published && $property->accepts_enquiries && $property->status === 'available', 404);
            // Lock the owner as well, so concurrent submissions across properties cannot duplicate a contact.
            $owner = $this->users->getModel()->newQuery()->whereKey($property->user_id)->lockForUpdate()->firstOrFail();
            abort_unless($owner->status, 404);
            $details = EnquiryDetails::normalize($data);
            $hash = EnquiryDetails::fingerprint($id, $details);
            $existing = $this->enquiries->findOneWhere(['property_id' => $id, 'submission_id' => $data['submission_id']]);
            if ($existing) {
                if (! hash_equals($existing->payload_hash, $hash)) {
                    throw ValidationException::withMessages(['submission_id' => trans('admin::app.property-api.conflict')]);
                }

                return $existing;
            }
            $pipeline = $this->pipelines->getDefaultPipeline();
            $stage = $pipeline ? $this->stages->getModel()->newQuery()->where('lead_pipeline_id', $pipeline->id)->whereNotIn('code', ['won', 'lost'])->orderBy('sort_order')->orderBy('id')->first() : null;
            abort_unless($stage, 503, trans('admin::app.property-api.unavailable'));
            $person = $this->persons->getModel()->newQuery()->where('user_id', $owner->id)->whereRaw('LOWER(emails) LIKE ?', ['%'.addcslashes($details['email'], '\\%_').'%'])->get()->first(fn ($person) => collect($person->emails)->contains(fn ($email) => mb_strtolower(trim($email['value'] ?? '')) === $details['email']));
            if (! $person) {
                $person = $this->persons->create(['entity_type' => 'persons', 'user_id' => $owner->id, 'name' => $details['name'], 'emails' => [['value' => $details['email'], 'label' => 'personal']], 'contact_numbers' => $details['phone'] ? [['value' => $details['phone'], 'label' => 'personal']] : []]);
            }
            $lead = $this->leads->create(['entity_type' => 'leads', 'title' => 'Property enquiry #'.$id, 'description' => "Property #{$id}\n".$details['message'], 'lead_value' => 0, 'status' => 1, 'user_id' => $owner->id, 'person_id' => $person->id, 'lead_pipeline_id' => $pipeline->id, 'lead_pipeline_stage_id' => $stage->id]);
            $enquiry = $this->enquiries->create(array_merge($details, ['property_id' => $id, 'property_title' => $property->title, 'user_id' => $owner->id, 'lead_id' => $lead->id, 'submission_id' => $data['submission_id'], 'payload_hash' => $hash, 'consented_at' => now()]));
            // Only call the in-app notifier; generic CRM events can read untrusted email_id request data.
            app(NotificationService::class)->notify('lead', 'created', $lead);

            return $enquiry;
        });
    }
}
