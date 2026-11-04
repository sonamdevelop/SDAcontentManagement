<?php

namespace Webkul\Property\Repositories;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Http\Resources\PublicPropertyResource;

class PropertyModerationRepository
{
    public function event($p, string $action, string $reason): void
    {
        DB::table('property_moderation_events')->insert(['property_id' => $p->id, 'property_reference' => $p->id, 'revision' => $p->moderation_revision, 'action' => $action, 'actor_id' => auth()->guard('user')->id(), 'reason' => $reason, 'snapshot' => json_encode((new PublicPropertyResource($p))->resolve(), JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now()]);
    }

    public function history(int $id): array
    {
        return DB::table('property_moderation_events')->where('property_reference', $id)->orderBy('id')->get()->map(fn ($r) => ['id' => (int) $r->id, 'revision' => (int) $r->revision, 'action' => $r->action, 'actor_id' => $r->actor_id === null ? null : (int) $r->actor_id, 'reason' => $r->reason, 'snapshot' => $r->snapshot === null ? null : json_decode($r->snapshot, true, flags: JSON_THROW_ON_ERROR), 'created_at' => Carbon::parse($r->created_at)->toIso8601String()])->all();
    }

    public function submitted($p, string $reason, int $actor): bool
    {
        $row = DB::table('property_moderation_events')->where('property_reference', $p->id)->where('revision', $p->moderation_revision)->where('action', 'submitted')->where('actor_id', $actor)->first();

        return $row && $row->reason === $reason;
    }

    public function view($p): array
    {
        return ['id' => $p->id, 'moderation_status' => $p->moderation_status, 'moderation_revision' => $p->moderation_revision, 'moderation_reason' => $p->moderation_reason, 'moderated_at' => $p->moderated_at?->toIso8601String(), 'is_published' => $p->is_published, 'accepts_enquiries' => $p->accepts_enquiries, 'listing' => (new PublicPropertyResource($p))->resolve(), 'history' => $this->history($p->id)];
    }
}
