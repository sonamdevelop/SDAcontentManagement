<?php

namespace Webkul\Property\Http\Exceptions;

use Illuminate\Foundation\Exceptions\Handler as LaravelHandler;
use Throwable;
use Webkul\Admin\Exceptions\Handler as AdminHandler;

class ApiExceptionHandler extends AdminHandler
{
    public function render($request, Throwable $exception)
    {
        if ($request->is('api/v1', 'api/v1/*')) {
            // The CRM production handler maps some HTTP errors (including 429) to 500.
            // Keep the API's HTTP statuses/headers and JSON errors independent of that UI policy.
            $request->headers->set('Accept', 'application/json');

            $response = app(LaravelHandler::class)->render($request, $exception);
            if ($request->is('api/v1/customer/*')) {
                $response->headers->set('Cache-Control', 'no-store');
            }

            return $response;
        }

        return parent::render($request, $exception);
    }
}
