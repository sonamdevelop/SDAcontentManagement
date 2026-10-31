<?php

namespace Webkul\Property\Http\Middleware;

use Closure;
use Fruitcake\Cors\CorsService;
use Symfony\Component\HttpFoundation\Response;

class ApiCors
{
    public function handle($request, Closure $next)
    {
        if (! $request->is('api/v1', 'api/v1/*')) {
            return $next($request);
        }
        // Keep API policy isolated from the CRM's existing public web-form CORS configuration.
        $cors = new CorsService(config('property_api.cors', []));
        $allowed = $cors->isCorsRequest($request) && $cors->isOriginAllowed($request);
        if ($cors->isPreflightRequest($request)) {
            $response = $allowed ? $cors->handlePreflightRequest($request) : new Response('', 204);
            $cors->varyHeader($response, 'Origin');
            $cors->varyHeader($response, 'Access-Control-Request-Method');

            return $response;
        }
        $response = $next($request);
        if ($request->isMethod('OPTIONS')) {
            $cors->varyHeader($response, 'Access-Control-Request-Method');
        }

        $cors->varyHeader($response, 'Origin');

        return $allowed ? $cors->addActualRequestHeaders($response, $request) : $response;
    }
}
