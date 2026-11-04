<?php

namespace Webkul\Property\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\CustomerActionRepository;
use Webkul\Property\Repositories\CustomerRepository;

class CustomerAccountService
{
    public function __construct(protected CustomerRepository $customers) {}

    private function token($customer, string $device): array
    {
        $token = $customer->createToken($device, ['customer:account', 'customer:bookings', 'customer:bookings:create', 'customer:favourites'], now()->addDays(30));

        return ['access_token' => $token->plainTextToken, 'token_type' => 'Bearer', 'expires_at' => $token->accessToken->expires_at->toIso8601String()];
    }

    public function register(array $data): array
    {
        try {
            return DB::transaction(function () use ($data) {
                $customer = $this->customers->create(['name' => $data['name'], 'email' => $data['email'], 'phone' => $data['phone'] ?? null, 'password' => Hash::make($data['password']), 'active' => true]);

                return $this->token($customer, $data['device_name'] ?? 'Customer web');
            });
        } catch (QueryException $e) {
            if ($this->customers->findOneByField('email', $data['email'])) {
                throw ValidationException::withMessages(['email' => trans('validation.unique', ['attribute' => 'email'])]);
            }
            throw $e;
        }
    }

    public function login(array $data): ?array
    {
        return DB::transaction(function () use ($data) {
            // Serialize password verification/token issuance with password changes.
            $customer = $this->customers->byEmail($data['email']);
            if (! $customer || ! Hash::check($data['password'], $customer->password) || ! $customer->active) {
                return null;
            }
            if (Hash::needsRehash($customer->password)) {
                $customer->update(['password' => Hash::make($data['password'])]);
            }

            return $this->token($customer, $data['device_name'] ?? 'Customer web');
        });
    }

    public function profile(int $id, array $data)
    {
        return DB::transaction(fn () => tap($this->customers->locked($id))->update(['name' => $data['name'], 'phone' => $data['phone'] ?? null]));
    }

    public function password(int $id, array $data): void
    {
        DB::transaction(function () use ($id, $data) {
            $customer = $this->customers->locked($id);
            if (! Hash::check($data['current_password'], $customer->password)) {
                throw ValidationException::withMessages(['current_password' => trans('admin::app.property-api.invalid-credentials')]);
            }
            $customer->update(['password' => Hash::make($data['password'])]);
            $customer->tokens()->delete();
            app(CustomerActionRepository::class)->consume($id);
        });
    }
}
