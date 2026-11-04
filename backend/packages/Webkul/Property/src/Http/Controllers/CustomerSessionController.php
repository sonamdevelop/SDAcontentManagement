<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Webkul\Property\Rules\CustomerPasswordValue;
use Webkul\Property\Services\CustomerSessionService;

class CustomerSessionController
{
    public function __construct(protected CustomerSessionService $sessions) {}

    public function index(Request $request)
    {
        $data = $request->validate(['page' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $page = $this->sessions->page($request->user()->id, $request->user()->currentAccessToken()->id, $data['per_page'] ?? 20);

        return JsonResource::collection($page)->response()->header('Cache-Control', 'no-store');
    }

    public function destroy(Request $request, ?string $id = null)
    {
        $target = $id === null ? null : filter_var($id, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        abort_if($target === false, 404);
        $data = $request->validate(['current_password' => ['required', 'string', 'max:72', new CustomerPasswordValue]]);
        $this->sessions->revoke($request->user()->id, $request->user()->currentAccessToken()->id, $target, $data['current_password']);

        return response()->noContent();
    }
}
