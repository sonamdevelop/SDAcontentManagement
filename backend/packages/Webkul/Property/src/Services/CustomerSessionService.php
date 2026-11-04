<?php

namespace Webkul\Property\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Repositories\CustomerRepository;
use Webkul\Property\Repositories\CustomerSessionRepository;
use Webkul\Property\Support\CustomerSession;

class CustomerSessionService
{
    public function __construct(protected CustomerRepository $customers, protected CustomerSessionRepository $sessions) {}

    private function authorized(int $customerId, int $current, $asOf)
    {
        $customer = $this->customers->locked($customerId);
        abort_unless($customer->active, 403);
        $token = $this->sessions->token($customer, $current);
        abort_unless($token && CustomerSession::active($token, $asOf, config('sanctum.expiration')), 401);
        abort_unless($token->can('customer:account'), 403);

        return $customer;
    }

    public function page(int $customerId, int $current, int $perPage)
    {
        return DB::transaction(function () use ($customerId, $current, $perPage) {
            $asOf = CarbonImmutable::now();
            $customer = $this->authorized($customerId, $current, $asOf);
            $page = $this->sessions->activePage($customer, $current, $asOf, config('sanctum.expiration'), $perPage);
            $page->through(fn ($token) => CustomerSession::view($token, $current, config('sanctum.expiration')));

            return $page;
        });
    }

    public function revoke(int $customerId, int $current, ?int $target, string $password): void
    {
        DB::transaction(function () use ($customerId, $current, $target, $password) {
            $customer = $this->authorized($customerId, $current, CarbonImmutable::now());
            if (! Hash::check($password, $customer->password)) {
                throw ValidationException::withMessages(['current_password' => trans('admin::app.property-api.invalid-credentials')]);
            }
            if ($target === $current) {
                throw ValidationException::withMessages(['session' => trans('admin::app.customer-session.current')]);
            }
            $this->sessions->revoke($customer, $current, $target);
        });
    }
}
