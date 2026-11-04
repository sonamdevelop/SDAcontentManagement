<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Webkul\Property\Models\Customer;
use Webkul\Property\Services\CustomerSessionService;

uses(DatabaseTransactions::class);
function sessionCustomer()
{
    return Customer::create(['name' => 'Session customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
}
function sessionBearer($token): array
{
    return ['Authorization' => 'Bearer '.$token->plainTextToken];
}
it('lists only owned active sessions with current-first pagination and curated token-free metadata', function () {
    config(['sanctum.expiration' => 60]);
    $customer = sessionCustomer();
    $current = $customer->createToken('This web', ['customer:account'], now()->addDays(30));
    $other = $customer->createToken('<Unverified phone>', ['customer:account']);
    $customer->createToken('Expired', ['*'], now()->subSecond());
    $old = $customer->createToken('Globally expired', ['*']);
    $old->accessToken->forceFill(['created_at' => now()->subMinutes(61)])->save();
    $foreign = sessionCustomer()->createToken('Foreign secret', ['*']);
    $h = sessionBearer($current);
    $r = $this->getJson('/api/v1/customer/sessions?per_page=1', $h)->assertOk()->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.id', $current->accessToken->id)->assertJsonPath('data.0.is_current', true);
    expect($r->headers->get('Cache-Control'))->toContain('no-store');
    expect($r->getContent())->not->toContain($current->plainTextToken, $current->accessToken->token, 'abilities', 'tokenable', 'Foreign secret', 'password');
    expect(count($r->json('data.0')))->toBe(6);
    $this->getJson('/api/v1/customer/sessions?per_page=1&page=2', $h)->assertOk()->assertJsonPath('data.0.id', $other->accessToken->id)->assertJsonPath('data.0.is_current', false)->assertJsonPath('data.0.last_used_at', null);
});
it('requires the password and idempotently revokes one own session while preserving all other identities', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    $customer = sessionCustomer();
    $current = $customer->createToken('Web', ['customer:account']);
    $other = $customer->createToken('Phone', ['customer:account']);
    $foreign = sessionCustomer()->createToken('Foreign', ['*']);
    $staff = apiStaff([], all: true)->createToken('Staff', ['*']);
    $h = sessionBearer($current);
    $url = '/api/v1/customer/sessions/'.$other->accessToken->id;
    $this->deleteJson($url, ['current_password' => 'wrong'], $h)->assertUnprocessable()->assertJsonValidationErrors('current_password');
    expect($other->accessToken->fresh())->not->toBeNull();
    foreach ([$foreign, $staff] as $token) {
        $this->deleteJson('/api/v1/customer/sessions/'.$token->accessToken->id, ['current_password' => 'CustomerPass123!'], $h)->assertNoContent();
        expect($token->accessToken->fresh())->not->toBeNull();
    }
    $this->deleteJson('/api/v1/customer/sessions/'.$current->accessToken->id, ['current_password' => 'CustomerPass123!'], $h)->assertUnprocessable()->assertJsonValidationErrors('session');
    $this->deleteJson($url, ['current_password' => 'CustomerPass123!'], $h)->assertNoContent();
    $this->deleteJson($url, ['current_password' => 'CustomerPass123!'], $h)->assertNoContent();
    $this->getJson('/api/v1/customer/me', sessionBearer($other))->assertUnauthorized();
    $this->getJson('/api/v1/customer/me', $h)->assertOk();
});
it('signs out all other devices including expired sessions and keeps the current customer and staff tokens', function () {
    $customer = sessionCustomer();
    $current = $customer->createToken('Web', ['customer:account']);
    $other = $customer->createToken('Phone', ['customer:account']);
    $customer->createToken('Expired', ['*'], now()->subDay());
    $foreign = sessionCustomer()->createToken('Foreign', ['*']);
    $staff = apiStaff([], all: true)->createToken('Staff', ['*']);
    $h = sessionBearer($current);
    $this->deleteJson('/api/v1/customer/sessions/others', ['current_password' => 'CustomerPass123!'], $h)->assertNoContent();
    expect($customer->tokens()->pluck('id')->all())->toBe([$current->accessToken->id]);
    expect($foreign->accessToken->fresh())->not->toBeNull()->and($staff->accessToken->fresh())->not->toBeNull();
    $this->getJson('/api/v1/customer/me', sessionBearer($other))->assertUnauthorized();
    $this->getJson('/api/v1/customer/sessions', $h)->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.is_current', true);
});
it('denies staff, wrong abilities, expired and inactive customer sessions', function () {
    $customer = sessionCustomer();
    $this->getJson('/api/v1/customer/sessions')->assertUnauthorized();
    $this->getJson('/api/v1/customer/sessions', apiHeaders(apiStaff([], all: true), ['*']))->assertUnauthorized();
    $this->getJson('/api/v1/customer/sessions', sessionBearer($customer->createToken('Wrong', ['customer:bookings'])))->assertForbidden();
    $this->getJson('/api/v1/customer/sessions', sessionBearer($customer->createToken('Expired', ['*'], now()->subSecond())))->assertUnauthorized();
    $valid = sessionBearer($customer->createToken('Active', ['customer:account']));
    $customer->update(['active' => false]);
    $this->getJson('/api/v1/customer/sessions', $valid)->assertForbidden();
    $this->deleteJson('/api/v1/customer/sessions/others', ['current_password' => 'CustomerPass123!'], $valid)->assertForbidden();
});
it('rechecks a revoked caller under the customer lock before performing any security mutation', function () {
    $customer = sessionCustomer();
    $current = $customer->createToken('Revoked caller', ['customer:account']);
    $other = $customer->createToken('Survivor', ['customer:account']);
    $current->accessToken->delete();
    try {
        app(CustomerSessionService::class)->revoke($customer->id, $current->accessToken->id, null, 'CustomerPass123!');
        $this->fail('A revoked token must not perform a queued mutation.');
    } catch (HttpException $e) {
        expect($e->getStatusCode())->toBe(401);
    }
    expect($other->accessToken->fresh())->not->toBeNull();
});
it('validates paging/password inputs and throttles repeated revocation attempts', function () {
    $customer = sessionCustomer();
    $h = sessionBearer($customer->createToken('Current', ['customer:account']));
    foreach (['page=0', 'per_page=101'] as $bad) {
        $this->getJson('/api/v1/customer/sessions?'.$bad, $h)->assertUnprocessable();
    }
    $this->deleteJson('/api/v1/customer/sessions/others', [], $h)->assertUnprocessable();
    for ($i = 0; $i < 4; $i++) {
        $this->deleteJson('/api/v1/customer/sessions/others', ['current_password' => 'wrong'], $h)->assertUnprocessable();
    }
    $this->deleteJson('/api/v1/customer/sessions/others', ['current_password' => 'CustomerPass123!'], $h)->assertTooManyRequests();
});
it('rejects invalid or overflowing session IDs without touching the current token', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    $customer = sessionCustomer();
    $token = $customer->createToken('Current', ['customer:account']);
    $h = sessionBearer($token);
    foreach (['0', '999999999999999999999999999999'] as $id) {
        $this->deleteJson('/api/v1/customer/sessions/'.$id, ['current_password' => 'CustomerPass123!'], $h)->assertNotFound();
    }
    expect($token->accessToken->fresh())->not->toBeNull();
});
