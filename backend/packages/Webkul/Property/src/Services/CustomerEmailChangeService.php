<?php

namespace Webkul\Property\Services;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Mail\CustomerActionMail;
use Webkul\Property\Repositories\CustomerActionRepository;
use Webkul\Property\Repositories\CustomerRepository;
use Webkul\Property\Repositories\CustomerSessionRepository;
use Webkul\Property\Support\CustomerActionLink;
use Webkul\Property\Support\CustomerEmailChange;
use Webkul\Property\Support\CustomerSession;

class CustomerEmailChangeService
{
    public function __construct(protected CustomerRepository $customers, protected CustomerActionRepository $actions, protected CustomerSessionRepository $sessions) {}

    private function actor(int $id, int $tokenId)
    {
        $customer = $this->customers->locked($id);
        $token = $this->sessions->token($customer, $tokenId);
        abort_unless($customer->active, 403);
        abort_unless($token && CustomerSession::active($token, now(), config('sanctum.expiration')), 401);
        abort_unless($token->can('customer:account'), 403);

        return $customer;
    }

    private function password($customer, string $password): void
    {
        if (! Hash::check($password, $customer->password)) {
            throw ValidationException::withMessages(['current_password' => trans('admin::app.property-api.invalid-credentials')]);
        }
    }

    public function pending(int $id, int $tokenId): ?array
    {
        return DB::transaction(function () use ($id, $tokenId) {
            $this->actor($id, $tokenId);
            $row = $this->actions->locked($id, CustomerEmailChange::PURPOSE);

            return $row && $row->consumed_at === null && Carbon::parse($row->expires_at)->gt(now()) ? ['new_email' => $row->email, 'expires_at' => Carbon::parse($row->expires_at)->toIso8601String()] : null;
        });
    }

    public function request(int $id, int $tokenId, string $password, string $email): void
    {
        DB::transaction(function () use ($id, $tokenId, $password, $email) {
            $customer = $this->actor($id, $tokenId);
            $this->password($customer, $password);
            if ($email === $customer->email || $this->customers->findOneByField('email', $email)) {
                throw ValidationException::withMessages(['new_email' => trans('admin::app.customer-actions.email-unavailable')]);
            }
            $old = $this->actions->locked($id, CustomerEmailChange::PURPOSE);
            if ($old && Carbon::parse($old->created_at)->gt(now()->subMinute())) {
                throw ValidationException::withMessages(['new_email' => trans('admin::app.customer-actions.email-cooldown')]);
            }
            $token = bin2hex(random_bytes(32));
            $url = CustomerActionLink::make(config('property_api.customer_web_url'), CustomerEmailChange::PURPOSE, $token, $email, $id);
            $this->actions->issue($id, $email, CustomerEmailChange::PURPOSE, CustomerEmailChange::digest($token, $customer->email));
            Mail::mailer(config('property_api.customer_mailer'))->to($email)->send(new CustomerActionMail(CustomerEmailChange::PURPOSE, $url));
        }, 1);
    }

    public function cancel(int $id, int $tokenId, string $password): void
    {
        DB::transaction(function () use ($id, $tokenId, $password) {
            $customer = $this->actor($id, $tokenId);
            $this->password($customer, $password);
            $this->actions->consume($id, CustomerEmailChange::PURPOSE);
        });
    }

    private function invalid(): never
    {
        throw ValidationException::withMessages(['token' => trans('admin::app.customer-actions.invalid-link')]);
    }

    public function complete(array $data): void
    {
        try {
            DB::transaction(function () use ($data) {
                $customer = $this->customers->optionalLocked((int) $data['customer_id']);
                $action = $customer ? $this->actions->locked($customer->id, CustomerEmailChange::PURPOSE) : null;
                if (! $customer || ! $customer->active || ! $action || $action->consumed_at !== null || Carbon::parse($action->expires_at)->lte(now()) || $action->email !== $data['email'] || ! hash_equals($action->token_hash, CustomerEmailChange::digest($data['token'], $customer->email))) {
                    $this->invalid();
                }
                if ($this->customers->findOneByField('email', $data['email'])) {
                    $this->invalid();
                }
                $customer->forceFill(['email' => $data['email'], 'email_verified_at' => now()])->save();
                $customer->tokens()->delete();
                $this->actions->consume($customer->id);
            }, 3);
        } catch (UniqueConstraintViolationException) {
            $this->invalid();
        }
    }
}
