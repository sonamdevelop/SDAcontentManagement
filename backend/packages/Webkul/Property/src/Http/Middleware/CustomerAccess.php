<?php

namespace Webkul\Property\Http\Middleware;

use Laravel\Sanctum\PersonalAccessToken;
use Webkul\Property\Contracts\Customer;

class CustomerAccess
{
    public function handle($request, \Closure $next, string $ability = 'customer:account')
    {
        $bearer = $request->bearerToken();
        $token = $bearer ? PersonalAccessToken::findToken($bearer) : null;
        $expiration = config('sanctum.expiration');
        abort_unless($token && (! $token->expires_at || $token->expires_at->isFuture()) && (! $expiration || $token->created_at->gt(now()->subMinutes($expiration))), 401);
        $customer = $token->tokenable;
        abort_unless($customer instanceof Customer, 401);
        abort_unless($customer->active, 403);
        abort_unless($token->can($ability), 403);
        $customer->withAccessToken($token);
        // Deliberately do not set the staff user guard or use its session.
        $request->setUserResolver(fn () => $customer);
        $token->forceFill(['last_used_at' => now()])->save();

        return $next($request)->header('Cache-Control', 'no-store');
    }
}
