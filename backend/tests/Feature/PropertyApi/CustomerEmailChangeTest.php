<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Webkul\Property\Mail\CustomerActionMail;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Repositories\CustomerActionRepository;
use Webkul\Property\Services\CustomerAccountService;
use Webkul\Property\Services\CustomerEmailChangeService;
use Webkul\Property\Support\CustomerEmailChange;

uses(DatabaseTransactions::class);
function emailChangeCustomer()
{
    $c = Customer::create(['name' => 'Email customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $t = $c->createToken('Current', ['customer:account', 'customer:bookings']);

    return [$c, ['Authorization' => 'Bearer '.$t->plainTextToken], $t];
}
function emailChangeLink(): array
{
    $mail = Mail::sent(CustomerActionMail::class)->last(fn ($m) => $m->purpose === 'change-email');
    parse_str(parse_url($mail->actionUrl, PHP_URL_FRAGMENT), $data);

    return $data;
}
function emailChangeBody(string $email): array
{
    return ['new_email' => $email, 'current_password' => 'CustomerPass123!'];
}
it('confirms a normalized new address once, verifies it, revokes customer tokens and preserves account ID and staff access', function () {
    Mail::fake();
    [$c, $h, $token] = emailChangeCustomer();
    $old = $c->email;
    $second = $c->createToken('Phone', ['*']);
    $staff = apiStaff([], all: true)->createToken('Staff', ['*']);
    app(CustomerActionRepository::class)->issue($c->id, $old, 'reset', hash('sha256', 'pending reset'));
    $new = 'NEW-'.Str::uuid().'@EXAMPLE.TEST';
    $stay = Stay::create(['user_id' => $staff->accessToken->tokenable_id, 'name' => 'Email ownership stay', 'city' => 'Dandeli', 'timezone' => 'UTC', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Owned room', 'inventory' => 2, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);
    $booking = StayBooking::create(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'email-booking'), 'room_type_id' => $room->id, 'user_id' => $stay->user_id, 'created_by' => $stay->user_id, 'stay_name' => $stay->name, 'room_name' => $room->name, 'timezone' => 'UTC', 'check_in' => '2030-01-02', 'check_out' => '2030-01-03', 'rooms' => 1, 'guests' => 1, 'guest_name' => 'Owned guest', 'guest_email' => $old, 'nightly_rate' => '100.00', 'total' => '100.00', 'advance' => '0.00', 'currency' => 'INR', 'status' => 'confirmed']);
    $booking->forceFill(['customer_id' => $c->id])->save();
    $unowned = $booking->replicate();
    $unowned->forceFill(['request_id' => (string) Str::uuid(), 'customer_id' => null, 'guest_email' => strtolower($new)])->save();
    $this->postJson('/api/v1/customer/email-change', emailChangeBody($new), $h)->assertAccepted();
    $link = emailChangeLink();
    expect($c->fresh()->email)->toBe($old);
    $pending = $this->getJson('/api/v1/customer/email-change', $h)->assertOk()->assertJsonPath('data.new_email', strtolower($new));
    expect(count($pending->json('data')))->toBe(2);
    expect($pending->getContent())->not->toContain($link['token'], 'token_hash', 'customer_id');
    $row = DB::table('stay_customer_actions')->where('customer_id', $c->id)->where('purpose', 'change-email')->first();
    expect($row->token_hash)->toBe(CustomerEmailChange::digest($link['token'], $old))->not->toBe($link['token']);
    $this->postJson('/api/v1/customer/auth/change-email', $link)->assertNoContent();
    expect($c->fresh()->email)->toBe(strtolower($new))->and($c->fresh()->email_verified_at)->not->toBeNull()->and($c->fresh()->id)->toBe($c->id);
    expect($c->tokens()->count())->toBe(0)->and($staff->accessToken->fresh())->not->toBeNull();
    expect(DB::table('stay_customer_actions')->where('customer_id', $c->id)->whereNull('consumed_at')->count())->toBe(0);
    $this->getJson('/api/v1/customer/me', $h)->assertUnauthorized();
    $this->postJson('/api/v1/customer/auth/change-email', $link)->assertUnprocessable()->assertJsonValidationErrors('token');
    $this->postJson('/api/v1/customer/auth/login', ['email' => $old, 'password' => 'CustomerPass123!'])->assertUnauthorized();
    $login = $this->postJson('/api/v1/customer/auth/login', ['email' => strtolower($new), 'password' => 'CustomerPass123!'])->assertCreated();
    $this->getJson('/api/v1/customer/bookings', ['Authorization' => 'Bearer '.$login->json('data.access_token')])->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $booking->id);
    expect($booking->fresh()->guest_email)->toBe($old)->and($unowned->fresh()->customer_id)->toBeNull();
});
it('requires password and customer identity, excludes existing/current addresses and shares a request cooldown', function () {
    Mail::fake();
    [$c, $h] = emailChangeCustomer();
    $new = Str::uuid().'@example.test';
    $this->postJson('/api/v1/customer/email-change', ['new_email' => $new, 'current_password' => 'wrong'], $h)->assertUnprocessable()->assertJsonValidationErrors('current_password');
    $this->postJson('/api/v1/customer/email-change', emailChangeBody($c->email), $h)->assertUnprocessable()->assertJsonValidationErrors('new_email');
    $this->postJson('/api/v1/customer/email-change', emailChangeBody($new), $h)->assertAccepted();
    $this->postJson('/api/v1/customer/email-change', emailChangeBody(Str::uuid().'@example.test'), $h)->assertUnprocessable()->assertJsonValidationErrors('new_email');
    Mail::assertSent(CustomerActionMail::class, 1);
    $this->getJson('/api/v1/customer/email-change', apiHeaders(apiStaff([], all: true), ['*']))->assertUnauthorized();
    $this->getJson('/api/v1/customer/email-change', ['Authorization' => 'Bearer '.$c->createToken('Wrong', ['customer:bookings'])->plainTextToken])->assertForbidden();
});
it('rejects wrong account, target, token, expired links and source-email changes', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c, $h] = emailChangeCustomer();
    [$other] = emailChangeCustomer();
    $this->postJson('/api/v1/customer/email-change', emailChangeBody(Str::uuid().'@example.test'), $h)->assertAccepted();
    $link = emailChangeLink();
    foreach ([array_replace($link, ['customer_id' => $other->id]), array_replace($link, ['email' => 'wrong@example.test']), array_replace($link, ['token' => str_repeat('f', 64)]), array_replace($link, ['customer_id' => 2147483647])] as $bad) {
        $this->postJson('/api/v1/customer/auth/change-email', $bad)->assertUnprocessable()->assertJsonValidationErrors('token');
    }
    $old = $c->email;
    $c->update(['email' => Str::uuid().'@example.test']);
    $this->postJson('/api/v1/customer/auth/change-email', $link)->assertUnprocessable();
    $c->update(['email' => $old]);
    $this->travel(61)->minutes();
    $this->postJson('/api/v1/customer/auth/change-email', $link)->assertUnprocessable();
    $this->getJson('/api/v1/customer/email-change', $h)->assertOk()->assertJsonPath('data', null);
});
it('rotates links after cooldown and cancels idempotently without changing email or signing out', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c, $h] = emailChangeCustomer();
    $old = $c->email;
    $this->postJson('/api/v1/customer/email-change', emailChangeBody(Str::uuid().'@example.test'), $h)->assertAccepted();
    $first = emailChangeLink();
    $this->travel(61)->seconds();
    $this->postJson('/api/v1/customer/email-change', emailChangeBody(Str::uuid().'@example.test'), $h)->assertAccepted();
    $second = emailChangeLink();
    $this->postJson('/api/v1/customer/auth/change-email', $first)->assertUnprocessable();
    $this->deleteJson('/api/v1/customer/email-change', ['current_password' => 'wrong'], $h)->assertUnprocessable();
    $this->deleteJson('/api/v1/customer/email-change', ['current_password' => 'CustomerPass123!'], $h)->assertNoContent();
    $this->deleteJson('/api/v1/customer/email-change', ['current_password' => 'CustomerPass123!'], $h)->assertNoContent();
    $this->postJson('/api/v1/customer/auth/change-email', $second)->assertUnprocessable();
    $this->getJson('/api/v1/customer/email-change', $h)->assertOk()->assertJsonPath('data', null);
    expect($c->fresh()->email)->toBe($old);
});
it('rolls back a failed delivery rotation and leaves the previous link usable', function () {
    Mail::fake();
    [$c, $h] = emailChangeCustomer();
    $this->postJson('/api/v1/customer/email-change', emailChangeBody(Str::uuid().'@example.test'), $h)->assertAccepted();
    $first = emailChangeLink();
    $this->travel(61)->seconds();
    Mail::shouldReceive('mailer')->once()->andThrow(new RuntimeException('Private SMTP diagnostic'));
    $r = $this->postJson('/api/v1/customer/email-change', emailChangeBody(Str::uuid().'@example.test'), $h)->assertStatus(503);
    expect($r->getContent())->not->toContain('Private SMTP diagnostic', $first['token']);
    $this->postJson('/api/v1/customer/auth/change-email', $first)->assertNoContent();
});
it('rejects a target claimed after issue and links invalidated by a password change', function () {
    Mail::fake();
    [$c, $h] = emailChangeCustomer();
    $old = $c->email;
    $target = Str::uuid().'@example.test';
    $this->postJson('/api/v1/customer/email-change', emailChangeBody($target), $h)->assertAccepted();
    $link = emailChangeLink();
    [$other] = emailChangeCustomer();
    $other->update(['email' => $target]);
    $this->postJson('/api/v1/customer/auth/change-email', $link)->assertUnprocessable();
    expect($c->fresh()->email)->toBe($old);
    app(CustomerAccountService::class)->password($c->id, ['current_password' => 'CustomerPass123!', 'password' => 'ChangedCustomer123!']);
    $this->postJson('/api/v1/customer/auth/change-email', $link)->assertUnprocessable();
});
it('does not let a revoked caller initiate a queued email change and limits password guesses', function () {
    Mail::fake();
    [$c, $h, $token] = emailChangeCustomer();
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/customer/email-change', ['new_email' => 'target@example.test', 'current_password' => 'wrong'], $h)->assertUnprocessable();
    }
    $this->postJson('/api/v1/customer/email-change', emailChangeBody('target@example.test'), $h)->assertTooManyRequests();
    $token->accessToken->delete();
    try {
        app(CustomerEmailChangeService::class)->request($c->id, $token->accessToken->id, 'CustomerPass123!', 'target@example.test');
        $this->fail('Revoked caller should fail.');
    } catch (HttpException $e) {
        expect($e->getStatusCode())->toBe(401);
    }
    Mail::assertNothingSent();
});
