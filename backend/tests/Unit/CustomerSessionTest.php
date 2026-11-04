<?php

use Carbon\CarbonImmutable;
use Webkul\Property\Support\CustomerSession;

it('uses the earliest per-token/global expiry with a strict boundary and supports no expiry', function () {
    $created = CarbonImmutable::parse('2030-01-01T00:00:00Z');
    $token = (object) ['id' => 7, 'name' => '<Unverified device>', 'created_at' => $created, 'expires_at' => $created->addDays(30), 'last_used_at' => null, 'token' => 'private hash', 'abilities' => ['*']];
    expect(CustomerSession::expiry($token, 60)->toIso8601String())->toBe($created->addHour()->toIso8601String());
    expect(CustomerSession::active($token, $created->addHour(), 60))->toBeFalse();
    expect(CustomerSession::active($token, $created->addHour()->subSecond(), 60))->toBeTrue();
    $view = CustomerSession::view($token, 7, 60);
    expect($view)->toHaveKeys(['id', 'device_name', 'created_at', 'last_used_at', 'expires_at', 'is_current']);
    expect($view['is_current'])->toBeTrue()->and($view['last_used_at'])->toBeNull()->and(count($view))->toBe(6);
    $token->expires_at = $created->addMinutes(5);
    expect(CustomerSession::expiry($token, 60)->equalTo($created->addMinutes(5)))->toBeTrue();
    $token->expires_at = null;
    expect(CustomerSession::expiry($token, null))->toBeNull()->and(CustomerSession::active($token, $created->addYears(10), 0))->toBeTrue();
});
