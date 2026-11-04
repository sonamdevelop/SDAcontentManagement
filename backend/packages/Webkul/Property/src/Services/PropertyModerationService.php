<?php

namespace Webkul\Property\Services;

use Illuminate\Support\Facades\DB;
use Webkul\Property\Repositories\PropertyModerationRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\Property\Support\PropertyModeration;

class PropertyModerationService
{
    public function __construct(protected PropertyRepository $properties, protected PropertyModerationRepository $events) {}

    public function decide(int $id, array $data): array
    {
        return DB::transaction(function () use ($id, $data) {
            $p = $this->properties->authorized($id, true);
            $reason = trim($data['reason']);
            abort_unless($p->moderation_revision === $data['expected_revision'], 409);
            if ($p->moderation_status !== 'pending') {
                abort_unless(PropertyModeration::matches($p->moderation_status, $p->moderation_revision, $p->moderation_reason ?? '', $data), 409);

                return $this->events->view($p);
            }
            $p->forceFill(['moderation_status' => $data['decision'], 'moderation_reason' => $reason, 'moderated_by' => auth()->guard('user')->id(), 'moderated_at' => now()])->save();
            $this->events->event($p, $data['decision'], $reason);

            return $this->events->view($p);
        }, 3);
    }

    public function submit(int $id, array $data): array
    {
        return DB::transaction(function () use ($id, $data) {
            $p = $this->properties->authorized($id, true);
            $reason = trim($data['reason']);
            if ($p->moderation_revision === $data['expected_revision'] + 1) {
                $matches = $this->events->submitted($p, $reason, auth()->guard('user')->id());
                abort_unless($matches, 409);

                return $this->events->view($p);
            }
            abort_unless($p->moderation_revision === $data['expected_revision'] && $p->moderation_status === 'rejected', 409);
            $p->forceFill(['moderation_status' => 'pending', 'moderation_revision' => $p->moderation_revision + 1, 'moderation_reason' => null, 'moderated_by' => null, 'moderated_at' => null])->save();
            $this->events->event($p, 'submitted', $reason);

            return $this->events->view($p);
        }, 3);
    }
}
