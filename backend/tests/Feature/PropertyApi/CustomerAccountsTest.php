<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;
use Webkul\Property\Models\StayPayment;

uses(DatabaseTransactions::class);
function customerAccount(array $changes = [])
{
    return Customer::create(array_replace(['name' => 'Customer', 'email' => Str::uuid().'@example.test', 'phone' => null, 'password' => Hash::make('CustomerPass123!'), 'active' => true], $changes));
}
function customerHeaders($customer, array $abilities = ['customer:account', 'customer:bookings']): array
{
    return ['Authorization' => 'Bearer '.$customer->createToken('test customer', $abilities, now()->addDays(30))->plainTextToken];
}
function customerOwnedBooking($staff, ?int $customerId, string $email)
{
    $stay = Stay::create(['user_id' => $staff->id, 'name' => 'Unpublished historic stay', 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => false]);
    $room = $stay->rooms()->create(['name' => 'Historic room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => false]);
    $booking = StayBooking::create(['request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'customer fixture'), 'room_type_id' => $room->id, 'user_id' => $staff->id, 'created_by' => $staff->id, 'stay_name' => $stay->name, 'room_name' => $room->name, 'timezone' => $stay->timezone, 'check_in' => '2030-01-02', 'check_out' => '2030-01-04', 'rooms' => 1, 'guests' => 2, 'guest_name' => 'Customer guest', 'guest_email' => $email, 'nightly_rate' => '100.00', 'total' => '200.00', 'advance' => '0.00', 'currency' => 'INR', 'status' => 'confirmed', 'notes' => 'Internal customer booking notes', 'payment_reference' => 'Private payment reference']);
    $booking->forceFill(['customer_id' => $customerId])->save();

    return $booking;
}
it('registers independent normalized accounts, exposes a curated profile and ignores privilege fields', function () {
    $email = 'REGISTER-'.Str::uuid().'@EXAMPLE.TEST';
    $response = $this->postJson('/api/v1/customer/auth/register', ['name' => 'Asha', 'email' => $email, 'password' => 'CustomerPass123!', 'password_confirmation' => 'CustomerPass123!', 'active' => false, 'role_id' => 1, 'user_id' => 1])->assertCreated();
    $customer = Customer::where('email', mb_strtolower($email))->firstOrFail();
    expect($customer->active)->toBeTrue()->and(Hash::check('CustomerPass123!', $customer->password))->toBeTrue();
    $h = ['Authorization' => 'Bearer '.$response->json('data.access_token')];
    $profile = $this->getJson('/api/v1/customer/me', $h)->assertOk()->assertJsonPath('data.name', 'Asha')->assertJsonPath('data.email', mb_strtolower($email));
    expect($profile->json('data'))->toHaveKeys(['id', 'name', 'email', 'phone']);
    expect($profile->getContent())->not->toContain('password', 'role_id', 'user_id');
    $this->patchJson('/api/v1/customer/me', ['name' => 'Asha Updated', 'phone' => '+91 9000000000', 'email' => 'override@example.test', 'active' => false], $h)->assertOk()->assertJsonPath('data.name', 'Asha Updated')->assertJsonPath('data.email', mb_strtolower($email));
    $this->postJson('/api/v1/customer/auth/register', ['name' => 'Duplicate', 'email' => mb_strtolower($email), 'password' => 'CustomerPass123!', 'password_confirmation' => 'CustomerPass123!'])->assertUnprocessable();
    $this->postJson('/api/v1/customer/auth/login', ['email' => $email, 'password' => 'CustomerPass123!'])->assertCreated();
});
it('revokes all customer sessions on a confirmed password change and revokes logout individually', function () {
    $customer = customerAccount();
    $staff = apiStaff([], all: true);
    $staffSession = apiHeaders($staff, ['*']);
    $first = customerHeaders($customer);
    $second = customerHeaders($customer);
    $this->postJson('/api/v1/customer/password', ['current_password' => 'wrong', 'password' => 'ReplacementPass456!', 'password_confirmation' => 'ReplacementPass456!'], $first)->assertUnprocessable();
    $this->getJson('/api/v1/customer/me', $second)->assertOk();
    $this->postJson('/api/v1/customer/password', ['current_password' => 'CustomerPass123!', 'password' => 'ReplacementPass456!', 'password_confirmation' => 'ReplacementPass456!'], $first)->assertNoContent();
    $this->getJson('/api/v1/auth/me', $staffSession)->assertOk();
    $this->getJson('/api/v1/customer/me', $first)->assertUnauthorized();
    $this->getJson('/api/v1/customer/me', $second)->assertUnauthorized();
    $this->postJson('/api/v1/customer/auth/login', ['email' => $customer->email, 'password' => 'CustomerPass123!'])->assertUnauthorized();
    $login = $this->postJson('/api/v1/customer/auth/login', ['email' => $customer->email, 'password' => 'ReplacementPass456!'])->assertCreated();
    $h = ['Authorization' => 'Bearer '.$login->json('data.access_token')];
    $another = customerHeaders($customer);
    $this->postJson('/api/v1/customer/auth/logout', [], $h)->assertNoContent();
    $this->getJson('/api/v1/customer/me', $another)->assertOk();
    $this->getJson('/api/v1/customer/me', $h)->assertUnauthorized();
});
it('requires the customer token type, explicit abilities, active account and unexpired bearer tokens', function () {
    $staff = apiStaff([], all: true);
    $customer = customerAccount();
    $this->getJson('/api/v1/customer/me')->assertUnauthorized()->assertHeader('Cache-Control', 'no-store, private');
    $this->getJson('/api/v1/customer/me', apiHeaders($staff, ['*']))->assertUnauthorized();
    $this->getJson('/api/v1/auth/me', customerHeaders($customer, ['*']))->assertUnauthorized();
    $this->getJson('/api/v1/admin/stay-bookings', customerHeaders($customer, ['*']))->assertUnauthorized();
    $this->getJson('/api/v1/customer/bookings', customerHeaders($customer, ['customer:account']))->assertForbidden();
    $expired = ['Authorization' => 'Bearer '.$customer->createToken('expired', ['*'], now()->subMinute())->plainTextToken];
    $this->getJson('/api/v1/customer/me', $expired)->assertUnauthorized();
    $h = customerHeaders($customer);
    $customer->update(['active' => false]);
    $this->getJson('/api/v1/customer/me', $h)->assertForbidden();
    $this->postJson('/api/v1/customer/auth/login', ['email' => $customer->email, 'password' => 'CustomerPass123!'])->assertUnauthorized();
});
it('returns only explicitly owned bookings and never claims old bookings by matching email', function () {
    $staff = apiStaff([], all: true);
    $customer = customerAccount();
    $other = customerAccount();
    $older = customerOwnedBooking($staff, $customer->id, 'older-guest@example.test');
    $older->update(['status' => 'cancelled']);
    $owned = customerOwnedBooking($staff, $customer->id, 'private-guest@example.test');
    $foreign = customerOwnedBooking($staff, $other->id, $customer->email);
    $unlinked = customerOwnedBooking($staff, null, $customer->email);
    StayPayment::create(['booking_id' => $owned->id, 'request_id' => (string) Str::uuid(), 'payload_hash' => hash('sha256', 'receipt'), 'kind' => 'payment', 'amount' => '100.01', 'currency' => 'INR', 'method' => 'cash', 'reference' => 'Private reference', 'actor_id' => $staff->id]);
    $h = customerHeaders($customer);
    $result = $this->getJson('/api/v1/customer/bookings?per_page=1', $h)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.total', 2)->assertJsonPath('data.0.id', $owned->id)->assertJsonPath('data.0.balance', '99.99');
    expect($result->getContent())->not->toContain('Internal', 'Private', 'private-guest@example.test', 'user_id', 'actor_id', 'customer_id', 'payload_hash', 'request_id');
    $this->getJson('/api/v1/customer/bookings?per_page=1&page=2&customer_id='.$other->id, $h)->assertOk()->assertJsonPath('data.0.id', $older->id)->assertJsonPath('meta.total', 2);
    $this->getJson('/api/v1/customer/bookings/'.$foreign->id, $h)->assertNotFound();
    $this->getJson('/api/v1/customer/bookings/'.$unlinked->id, $h)->assertNotFound();
    $owned->update(['status' => 'cancelled']);
    $this->getJson('/api/v1/customer/bookings/'.$owned->id, $h)->assertOk()->assertJsonPath('data.refund_due', '100.01')->assertJsonPath('data.amount_due', '0.00');
    $this->getJson('/api/v1/customer/bookings?status=confirmed', $h)->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/customer/bookings?per_page=101', $h)->assertUnprocessable();
    $this->postJson('/api/v1/customer/bookings', ['customer_id' => $customer->id], $h)->assertForbidden();
});
it('validates password strength and confirmations and rate-limits customer login independently', function () {
    $this->postJson('/api/v1/customer/auth/register', ['name' => 'Weak', 'email' => 'weak@example.test', 'password' => 'short', 'password_confirmation' => 'short'])->assertUnprocessable();
    foreach ([str_repeat('é', 32).'Aa1234567890', "CustomerPass123!\0"] as $password) {
        $this->postJson('/api/v1/customer/auth/register', ['name' => 'Invalid password', 'email' => Str::uuid().'@example.test', 'password' => $password, 'password_confirmation' => $password])->assertUnprocessable();
    }
    $customer = customerAccount();
    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/customer/auth/login', ['email' => $customer->email, 'password' => 'incorrect'])->assertUnauthorized();
    }
    $this->postJson('/api/v1/customer/auth/login', ['email' => $customer->email, 'password' => 'incorrect'])->assertTooManyRequests();
});
