<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Laravel\Sanctum\PersonalAccessToken;

uses(DatabaseTransactions::class);
it('issues an expiring token with no password or session leakage', function () {
    $user = apiStaff([], all: true);
    $response = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!', 'device_name' => 'Mobile']);
    $response->assertCreated()->assertJsonPath('data.token_type', 'Bearer')->assertJsonMissingPath('data.password')->assertHeader('Cache-Control', 'no-store, private');
    $token = PersonalAccessToken::findToken($response->json('data.access_token'));
    expect($token)->not->toBeNull()->and($token->token)->not->toBe($response->json('data.access_token'))->and($token->expires_at->isFuture())->toBeTrue();
});
it('rejects wrong credentials and disabled users with the same response', function () {
    $user = apiStaff([], all: true);
    $data = ['email' => $user->email, 'password' => 'wrong', 'device_name' => 'Client'];
    $first = $this->postJson('/api/v1/auth/login', $data)->assertUnauthorized()->json('message');
    $user->update(['status' => 0]);
    $data['password'] = 'Password123!';
    $this->postJson('/api/v1/auth/login', $data)->assertUnauthorized()->assertJsonPath('message', $first);
    expect($user->tokens()->count())->toBe(0);
});
it('requires valid login fields', function () {
    $this->postJson('/api/v1/auth/login', [])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password', 'device_name']);
});
it('provides safe profile data and revokes only the current token on logout', function () {
    $user = apiStaff([], all: true);
    $one = apiHeaders($user);
    $two = apiHeaders($user);
    $this->getJson('/api/v1/auth/me', $one)->assertOk()->assertJsonPath('data.id', $user->id)->assertJsonMissingPath('data.password')->assertJsonMissingPath('data.remember_token');
    $this->postJson('/api/v1/auth/logout', [], $one)->assertNoContent();
    $this->getJson('/api/v1/auth/me', $one)->assertUnauthorized();
    $this->getJson('/api/v1/auth/me', $two)->assertOk();
});
it('rejects missing invalid expired and globally expired tokens', function () {
    $user = apiStaff([], all: true);
    $this->get('/api/v1/auth/me')->assertUnauthorized()->assertHeader('Content-Type', 'application/json');
    $this->getJson('/api/v1/auth/me', ['Authorization' => 'Bearer invalid'])->assertUnauthorized();
    $token = $user->createToken('expired', ['*'], now()->subMinute());
    $this->getJson('/api/v1/auth/me', ['Authorization' => 'Bearer '.$token->plainTextToken])->assertUnauthorized();
    $valid = $user->createToken('global', ['*']);
    $valid->accessToken->forceFill(['created_at' => now()->subHours(2)])->save();
    config(['sanctum.expiration' => 60]);
    $this->getJson('/api/v1/auth/me', ['Authorization' => 'Bearer '.$valid->plainTextToken])->assertUnauthorized();
});
it('rechecks user state and permissions after a token is issued', function () {
    $user = apiStaff(['properties']);
    $headers = apiHeaders($user);
    $this->getJson('/api/v1/admin/properties', $headers)->assertOk();
    $user->role->update(['permissions' => []]);
    $this->getJson('/api/v1/admin/properties', $headers)->assertForbidden();
    $user->update(['status' => 0]);
    $this->getJson('/api/v1/auth/me', $headers)->assertForbidden();
});
it('does not accept session-only authentication for the API', function () {
    $this->actingAs(apiStaff([], all: true), 'user')->getJson('/api/v1/admin/properties')->assertUnauthorized();
});
it('throttles repeated login attempts', function () {
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/login', ['email' => 'missing@example.com', 'password' => 'wrong', 'device_name' => 'Client'])->assertUnauthorized();
    }
    $this->postJson('/api/v1/auth/login', ['email' => 'missing@example.com', 'password' => 'wrong', 'device_name' => 'Client'])->assertStatus(429);
});

it('keeps bearer APIs stateless even when an SPA origin header is present', function () {
    $user = apiStaff([], all: true);
    $this->withHeaders(['Origin' => 'http://localhost'])->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'Password123!', 'device_name' => 'Web client'])->assertCreated();
});

it('preserves JSON auth and rate-limit statuses in production mode', function () {
    config(['app.debug' => false]);
    $this->get('/api/v1/auth/me')->assertUnauthorized()->assertHeader('Content-Type', 'application/json')->assertJsonMissingPath('trace');
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/login', ['email' => 'missing@example.com', 'password' => 'wrong', 'device_name' => 'Client'])->assertUnauthorized();
    }
    $this->postJson('/api/v1/auth/login', ['email' => 'missing@example.com', 'password' => 'wrong', 'device_name' => 'Client'])->assertStatus(429)->assertHeader('Retry-After')->assertJsonMissingPath('trace');
});

it('returns JSON for unsupported API methods even without an Accept header', function () {
    config(['app.debug' => false]);
    $this->patch('/api/v1/admin/properties/123', [])->assertStatus(405)->assertHeader('Content-Type', 'application/json')->assertJsonMissingPath('trace');
});
