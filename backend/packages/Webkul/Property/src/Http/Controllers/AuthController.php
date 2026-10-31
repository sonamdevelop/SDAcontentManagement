<?php

namespace Webkul\Property\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController
{
    public function login(Request $request)
    {
        $data = $request->validate(['email' => 'required|string|email|max:255', 'password' => 'required|string|max:1024', 'device_name' => 'required|string|max:100']);
        $valid = Auth::guard('user')->once(['email' => mb_strtolower(trim($data['email'])), 'password' => $data['password']]);
        $user = Auth::guard('user')->user();
        if (! $valid || ! $user?->status || ! $user?->role) {
            return response()->json(['message' => trans('admin::app.property-api.invalid-credentials')], 401);
        }
        $token = $user->createToken($data['device_name'], ['properties:read', 'properties:write', 'enquiries:read', 'leads:read', 'leads:write', 'visits:read', 'visits:write'], now()->addDays(30));

        return response()->json(['data' => ['access_token' => $token->plainTextToken, 'token_type' => 'Bearer', 'expires_at' => $token->accessToken->expires_at->toIso8601String()]], 201)->header('Cache-Control', 'no-store');
    }

    public function me(Request $request)
    {
        $u = $request->user();

        return response()->json(['data' => ['id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => ['name' => $u->role->name, 'permission_type' => $u->role->permission_type, 'permissions' => $u->role->permissions ?? []]]])->header('Cache-Control', 'no-store');
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }
}
