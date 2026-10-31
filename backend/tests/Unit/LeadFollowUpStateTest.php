<?php

use Webkul\Property\Support\FollowUpState;
use Webkul\Property\Support\LeadStageState;

it('closes won or lost leads and preserves an existing closure timestamp', function ($code) {
    $now = new DateTimeImmutable('2026-11-01T10:00:00Z');
    $earlier = $now->modify('-1 day');
    expect(LeadStageState::changes($code, ' Budget mismatch ', null, $now)['closed_at'])->toBe($now);
    expect(LeadStageState::changes($code, ' Budget mismatch ', $earlier, $now)['closed_at'])->toBe($earlier);
})->with(['won', 'lost']);
it('clears lost reason when reopening or winning a lead', function ($code) {
    $now = new DateTimeImmutable('2026-11-01T10:00:00Z');
    $changes = LeadStageState::changes($code, 'Old reason', $now, $now);
    expect($changes['lost_reason'])->toBeNull();
    if ($code !== 'won') {
        expect($changes['closed_at'])->toBeNull();
    }
})->with(['new', 'negotiation', 'won']);
it('keeps the trimmed reason only for lost leads', function () {
    $now = new DateTimeImmutable('2026-11-01T10:00:00Z');
    expect(LeadStageState::changes('lost', ' Budget mismatch ', null, $now)['lost_reason'])->toBe('Budget mismatch');
});
it('marks only incomplete tasks strictly before their deadline as overdue', function ($type, $done, $due, $expected) {
    $now = new DateTimeImmutable('2026-11-01T10:00:00Z');
    expect(FollowUpState::overdue($type, $done, $due === null ? null : new DateTimeImmutable($due), $now))->toBe($expected);
})->with([
    ['task', false, '2026-11-01T09:59:59Z', true], ['task', false, '2026-11-01T10:00:00Z', false],
    ['task', false, '2026-11-01T10:00:01Z', false], ['task', true, '2026-11-01T09:00:00Z', false],
    ['note', false, '2026-11-01T09:00:00Z', false], ['task', false, null, false],
    ['task', false, '2026-11-01T15:29:59+05:30', true],
]);
