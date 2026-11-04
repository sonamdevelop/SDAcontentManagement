<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Webkul\Property\Rules\CustomerPasswordValue;
use Webkul\Property\Services\CustomerEmailChangeService;
use Webkul\Property\Support\CustomerIdentity;

class CustomerEmailChangeController
{
    public function __construct(protected CustomerEmailChangeService $emails) {}

    private function password(Request $request): string
    {
        return $request->validate(['current_password' => ['required', 'string', 'max:72', new CustomerPasswordValue]])['current_password'];
    }

    public function index(Request $request)
    {
        return response()->json(['data' => $this->emails->pending($request->user()->id, $request->user()->currentAccessToken()->id)]);
    }

    public function store(Request $request)
    {
        if (is_string($request->input('new_email'))) {
            $request->merge(['new_email' => CustomerIdentity::email($request->input('new_email'))]);
        }
        $data = $request->validate(['new_email' => 'required|string|email|max:255']);
        $password = $this->password($request);
        try {
            $this->emails->request($request->user()->id, $request->user()->currentAccessToken()->id, $password, $data['new_email']);
        } catch (ValidationException|HttpExceptionInterface $e) {
            throw $e;
        } catch (\Throwable) {
            return response()->json(['message' => trans('admin::app.customer-actions.delivery-unavailable')], 503);
        }

        return response()->json(['message' => trans('admin::app.customer-actions.email-requested')], 202);
    }

    public function destroy(Request $request)
    {
        $this->emails->cancel($request->user()->id, $request->user()->currentAccessToken()->id, $this->password($request));

        return response()->noContent();
    }

    public function complete(Request $request)
    {
        if (is_string($request->input('email'))) {
            $request->merge(['email' => CustomerIdentity::email($request->input('email'))]);
        }
        $this->emails->complete($request->validate(['customer_id' => 'required|integer|min:1', 'email' => 'required|string|email|max:255', 'token' => 'required|string|regex:/^[a-f0-9]{64}$/D']));

        return response()->noContent()->header('Cache-Control', 'no-store');
    }
}
