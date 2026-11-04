<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Webkul\Property\Mail\CustomerActionMail;
use Webkul\Property\Models\Customer;

uses(DatabaseTransactions::class);
function actionCustomer()
{
    $c = Customer::create(['name' => 'Action customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('OriginalPass123!'), 'active' => true]);

    return [$c, ['Authorization' => 'Bearer '.$c->createToken('actions', ['customer:account', 'customer:bookings', 'customer:bookings:create'])->plainTextToken]];
}
function capturedAction(string $purpose): array
{
    $mail = Mail::sent(CustomerActionMail::class)->last(fn ($m) => $m->purpose === $purpose);
    expect($mail)->not->toBeNull();
    parse_str(parse_url($mail->actionUrl, PHP_URL_FRAGMENT), $data);

    return $data;
}
it('verifies one email with a hashed expiring single-use link and rotates only after cooldown', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c,$h] = actionCustomer();
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertAccepted()->assertHeader('Cache-Control', 'no-store, private');
    $data = capturedAction('verify');
    $row = DB::table('stay_customer_actions')->where('customer_id', $c->id)->first();
    expect($row->token_hash)->toBe(hash('sha256', $data['token']))->not->toBe($data['token']);
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertAccepted();
    Mail::assertSentCount(1);
    $this->travel(61)->seconds();
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertAccepted();
    $latest = capturedAction('verify');
    expect($latest['token'])->not->toBe($data['token']);
    $this->postJson('/api/v1/customer/auth/verify-email', $data)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/verify-email', $latest)->assertNoContent();
    expect($c->fresh()->email_verified_at)->not->toBeNull();
    $this->getJson('/api/v1/customer/me', $h)->assertOk()->assertJsonPath('data.email_verified_at', $c->fresh()->email_verified_at->toIso8601String());
    $this->postJson('/api/v1/customer/auth/verify-email', $latest)->assertUnprocessable();
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertAccepted();
    Mail::assertSentCount(2);
});
it('resets only the customer password and revokes all sessions without auto-login or email verification', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c,$h] = actionCustomer();
    $other = $c->createToken('second', ['customer:account'])->plainTextToken;
    $staff = apiStaff([], all: true);
    $staffHeaders = apiHeaders($staff, ['*']);
    $this->postJson('/api/v1/customer/auth/forgot-password', ['email' => strtoupper($c->email)])->assertAccepted();
    $data = capturedAction('reset');
    $this->postJson('/api/v1/customer/auth/reset-password', $data + ['password' => 'NewSecurePass456!', 'password_confirmation' => 'NewSecurePass456!'])->assertNoContent();
    expect(Hash::check('NewSecurePass456!', $c->fresh()->password))->toBeTrue()->and($c->fresh()->email_verified_at)->toBeNull()->and($c->tokens()->count())->toBe(0);
    $this->getJson('/api/v1/customer/me', $h)->assertUnauthorized();
    $this->getJson('/api/v1/customer/me', ['Authorization' => 'Bearer '.$other])->assertUnauthorized();
    $this->getJson('/api/v1/auth/me', $staffHeaders)->assertOk();
    $this->postJson('/api/v1/customer/auth/reset-password', $data + ['password' => 'AnotherPass789!', 'password_confirmation' => 'AnotherPass789!'])->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/login', ['email' => $c->email, 'password' => 'OriginalPass123!'])->assertUnauthorized();
    $this->postJson('/api/v1/customer/auth/login', ['email' => $c->email, 'password' => 'NewSecurePass456!'])->assertCreated();
});
it('uses neutral recovery responses for missing inactive and delivery-failed accounts and leaves a prior link valid', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c,$h] = actionCustomer();
    $normal = $this->postJson('/api/v1/customer/auth/forgot-password', ['email' => $c->email])->assertAccepted()->json();
    $first = capturedAction('reset');
    $missing = $this->postJson('/api/v1/customer/auth/forgot-password', ['email' => 'missing@example.test'])->assertAccepted()->json();
    expect($normal)->toBe($missing);
    $c->update(['active' => false]);
    expect($this->postJson('/api/v1/customer/auth/forgot-password', ['email' => $c->email])->assertAccepted()->json())->toBe($normal);
    Mail::assertSentCount(1);
    $c->update(['active' => true]);
    $this->travel(61)->seconds();
    Mail::shouldReceive('mailer')->andThrow(new RuntimeException('Synthetic mail outage'));
    expect($this->postJson('/api/v1/customer/auth/forgot-password', ['email' => $c->email])->assertAccepted()->json())->toBe($normal);
    expect(DB::table('stay_customer_actions')->where('customer_id', $c->id)->value('token_hash'))->toBe(hash('sha256', $first['token']));
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertStatus(503);
});
it('rejects expired tampered wrong-purpose wrong-email inactive and weak-password actions without mutations', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c,$h] = actionCustomer();
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertAccepted();
    $verify = capturedAction('verify');
    $this->postJson('/api/v1/customer/auth/forgot-password', ['email' => $c->email])->assertAccepted();
    $reset = capturedAction('reset');
    $password = ['password' => 'ReplacementPass456!', 'password_confirmation' => 'ReplacementPass456!'];
    $this->postJson('/api/v1/customer/auth/reset-password', $verify + $password)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/verify-email', $reset)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/reset-password', array_replace($reset, ['email' => 'other@example.test']) + $password)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/reset-password', array_replace($reset, ['token' => str_repeat('0', 64)]) + $password)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/reset-password', $reset + ['password' => 'weak', 'password_confirmation' => 'weak'])->assertUnprocessable();
    $c->update(['active' => false]);
    $this->postJson('/api/v1/customer/auth/reset-password', $reset + $password)->assertUnprocessable();
    $c->update(['active' => true]);
    $this->travel(60)->minutes();
    $this->postJson('/api/v1/customer/auth/reset-password', $reset + $password)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/verify-email', $verify)->assertUnprocessable();
    expect(Hash::check('OriginalPass123!', $c->fresh()->password))->toBeTrue()->and($c->fresh()->email_verified_at)->toBeNull()->and($c->tokens()->count())->toBe(1);
});
it('invalidates all outstanding account links after an authenticated password change', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    Mail::fake();
    [$c,$h] = actionCustomer();
    $this->postJson('/api/v1/customer/email/verification', [], $h)->assertAccepted();
    $verify = capturedAction('verify');
    $this->postJson('/api/v1/customer/auth/forgot-password', ['email' => $c->email])->assertAccepted();
    $reset = capturedAction('reset');
    $this->postJson('/api/v1/customer/password', ['current_password' => 'OriginalPass123!', 'password' => 'ReplacementPass456!', 'password_confirmation' => 'ReplacementPass456!'], $h)->assertNoContent();
    $this->postJson('/api/v1/customer/auth/verify-email', $verify)->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/reset-password', $reset + ['password' => 'ReplacementPass789!', 'password_confirmation' => 'ReplacementPass789!'])->assertUnprocessable();
});
it('protects verification sending from wrong account types and throttles public reset attempts', function () {
    Mail::fake();
    [$c,$h] = actionCustomer();
    $this->postJson('/api/v1/customer/email/verification')->assertUnauthorized();
    $this->postJson('/api/v1/customer/email/verification', [], apiHeaders(apiStaff([], all: true), ['*']))->assertUnauthorized();
    for ($i = 0; $i < 3; $i++) {
        $this->postJson('/api/v1/customer/auth/forgot-password', ['email' => 'missing@example.test'])->assertAccepted();
    }
    $this->postJson('/api/v1/customer/auth/forgot-password',['email' => 'missing@example.test'])->assertTooManyRequests();
});
it('renders escaped configured action links in transactional email',function () {
    $mail = new CustomerActionMail('verify','https://example.test/account/verify#token=abc&email=test%40example.test');
    expect($mail->render())->toContain('Verify your customer email','60 minutes','&amp;email=');
});
