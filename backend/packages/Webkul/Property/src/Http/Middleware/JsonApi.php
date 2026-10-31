<?php

namespace Webkul\Property\Http\Middleware;

class JsonApi
{
    public function handle($request, \Closure $next)
    {
        $request->headers->set('Accept', 'application/json');

        return $next($request);
    }
}
