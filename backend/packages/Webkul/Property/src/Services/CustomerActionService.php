<?php

namespace Webkul\Property\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Webkul\Property\Mail\CustomerActionMail;
use Webkul\Property\Repositories\CustomerActionRepository;
use Webkul\Property\Repositories\CustomerRepository;
use Webkul\Property\Support\CustomerActionLink;

class CustomerActionService
{
    public function __construct(protected CustomerRepository $customers, protected CustomerActionRepository $actions) {}

    public function send(string $purpose, ?int $id = null, ?string $email = null): void
    {
        DB::transaction(function () use ($purpose, $id, $email) {
            $customer = $id !== null ? $this->customers->locked($id) : $this->customers->byEmail($email);
            if (! $customer || ! $customer->active || ($purpose === 'verify' && $customer->email_verified_at !== null)) {
                return;
            }
            $old = $this->actions->locked($customer->id, $purpose);
            // Persisted cooldown works with multiple workers and does not disclose account existence.
            if ($old && Carbon::parse($old->created_at)->gt(now()->subMinute())) {
                return;
            }
            $token = bin2hex(random_bytes(32));
            $url = CustomerActionLink::make(config('property_api.customer_web_url'), $purpose, $token, $customer->email);
            $this->actions->issue($customer->id, $customer->email, $purpose, hash('sha256', $token));
            // Synchronous delivery fails the transaction, so an unsent rotation cannot invalidate a prior link.
            Mail::mailer(config('property_api.customer_mailer'))->to($customer->email)->send(new CustomerActionMail($purpose, $url));
        }, 1);
    }

    public function complete(string $purpose, array $data): void
    {
        DB::transaction(function () use ($purpose, $data) {
            $customer = $this->customers->byEmail($data['email']);
            $action = $customer ? $this->actions->locked($customer->id, $purpose) : null;
            if (! $customer || ! $customer->active || ! $action || $action->consumed_at !== null || Carbon::parse($action->expires_at)->lte(now()) || $action->email !== $customer->email || ! hash_equals($action->token_hash, hash('sha256', $data['token']))) {
                throw ValidationException::withMessages(['token' => trans('admin::app.customer-actions.invalid-link')]);
            }
            if ($purpose === 'verify') {
                $customer->forceFill(['email_verified_at' => now()])->save();
                $this->actions->consume($customer->id, 'verify');
            } else {
                $customer->update(['password' => Hash::make($data['password'])]);
                $customer->tokens()->delete();
                $this->actions->consume($customer->id);
            }
        }, 3);
    }
}
