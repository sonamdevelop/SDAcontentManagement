<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rules\Password;
use Webkul\Property\Rules\CustomerPasswordValue;
use Webkul\Property\Services\CustomerActionService;
use Webkul\Property\Support\CustomerIdentity;

class CustomerActionController
{
    public function __construct(protected CustomerActionService $actions) {}

    private function email(Request $r): void
    {
        if (is_string($r->input('email'))) {
            $r->merge(['email' => CustomerIdentity::email($r->input('email'))]);
        }
    }

    private function accepted()
    {
        return response()->json(['message' => trans('admin::app.customer-actions.request-accepted')], 202)->header('Cache-Control', 'no-store');
    }

    public function forgot(Request $r)
    {
        $this->email($r);
        $data = $r->validate(['email' => 'required|string|email|max:255']);
        try {
            $this->actions->send('reset', email: $data['email']);
        } catch (\Throwable $e) { // Same response for missing, inactive and delivery failures. Never log links or credentials.
            Log::warning('Customer recovery delivery unavailable.');
        }

        return $this->accepted();
    }

    public function resend(Request $r)
    {
        try {
            $this->actions->send('verify', id: $r->user()->id);
        } catch (\Throwable $e) {
            return response()->json(['message' => trans('admin::app.customer-actions.delivery-unavailable')], 503)->header('Cache-Control', 'no-store');
        }

        return $this->accepted();
    }

    private function input(Request $r, bool $reset): array
    {
        $this->email($r);
        $rules = ['email' => 'required|string|email|max:255', 'token' => 'required|string|regex:/^[a-f0-9]{64}$/D'];
        if ($reset) {
            $rules['password'] = ['required', 'string', 'max:72', new CustomerPasswordValue, 'confirmed', Password::min(12)->letters()->mixedCase()->numbers()];
        }

        return $r->validate($rules);
    }

    public function verify(Request $r)
    {
        $this->actions->complete('verify', $this->input($r, false));

        return response()->noContent()->header('Cache-Control', 'no-store');
    }

    public function reset(Request $r)
    {
        $this->actions->complete('reset', $this->input($r, true));

        return response()->noContent()->header('Cache-Control','no-store');
    }
}
