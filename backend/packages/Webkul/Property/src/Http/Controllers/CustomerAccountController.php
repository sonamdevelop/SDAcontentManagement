<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use Webkul\Property\Rules\CustomerPasswordValue;
use Webkul\Property\Services\CustomerAccountService;
use Webkul\Property\Support\CustomerIdentity;

class CustomerAccountController
{
    public function __construct(protected CustomerAccountService $accounts) {}

    private function credentials(Request $request, bool $register): array
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => CustomerIdentity::email($request->input('email'))]);
        }
        $rules = ['email' => 'required|string|email|max:255', 'password' => ['required', 'string', 'max:72', new CustomerPasswordValue], 'device_name' => 'sometimes|string|max:100'];
        if ($register) {
            $rules['email'] .= '|unique:stay_customers,email';
            $rules['password'] = ['required', 'string', 'max:72', new CustomerPasswordValue, 'confirmed', Password::min(12)->letters()->mixedCase()->numbers()];
            $rules += ['name' => 'required|string|max:150', 'phone' => 'nullable|string|max:30'];
        }

        return $request->validate($rules);
    }

    public function register(Request $request)
    {
        return response()->json(['data' => $this->accounts->register($this->credentials($request, true))], 201)->header('Cache-Control', 'no-store');
    }

    public function login(Request $request)
    {
        $token = $this->accounts->login($this->credentials($request, false));

        return $token ? response()->json(['data' => $token], 201)->header('Cache-Control', 'no-store') : response()->json(['message' => trans('admin::app.property-api.invalid-credentials')], 401)->header('Cache-Control', 'no-store');
    }

    private function profile($customer): array
    {
        return ['id' => $customer->id, 'name' => $customer->name, 'email' => $customer->email, 'phone' => $customer->phone];
    }

    public function me(Request $request)
    {
        return response()->json(['data' => $this->profile($request->user())]);
    }

    public function update(Request $request)
    {
        $customer = $this->accounts->profile($request->user()->id, $request->validate(['name' => 'required|string|max:150', 'phone' => 'nullable|string|max:30']));

        return response()->json(['data' => $this->profile($customer)]);
    }

    public function password(Request $request)
    {
        $data = $request->validate(['current_password' => ['required', 'string', 'max:72', new CustomerPasswordValue], 'password' => ['required', 'string', 'max:72', new CustomerPasswordValue, 'confirmed', 'different:current_password', Password::min(12)->letters()->mixedCase()->numbers()]]);
        $this->accounts->password($request->user()->id, $data);

        return response()->noContent();
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
