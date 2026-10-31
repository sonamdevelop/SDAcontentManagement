<?php

namespace Webkul\Property\Http\Middleware;

use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\PersonalAccessToken;
use Webkul\User\Contracts\User;

class ApiAccess
{
    public function handle($request, \Closure $next, ?string $permission = null, ?string $ability = null)
    {
        $bearer = $request->bearerToken();
        $token = $bearer ? PersonalAccessToken::findToken($bearer) : null;
        $expiration = config('sanctum.expiration');
        abort_unless($token && (! $token->expires_at || $token->expires_at->isFuture()) && (! $expiration || $token->created_at->gt(now()->subMinutes($expiration))), 401);
        $user = $token->tokenable;
        abort_unless($user instanceof User, 401);
        abort_unless($user->status && $user->role, 403);
        abort_if($ability && ! $token->can($ability), 403);
        abort_if($permission && $user->role->permission_type !== 'all' && ! in_array($permission, $user->role->permissions ?? [], true), 403);
        $user->withAccessToken($token);
        Auth::guard('user')->setUser($user);
        $request->setUserResolver(fn () => $user);
        $token->forceFill(['last_used_at' => now()])->save();

        return $next($request);
    }
}
