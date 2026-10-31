<?php

use Webkul\Property\Support\ApiOrigins;

return [
    'cors' => [
        'allowed_origins' => ApiOrigins::parse((string) env('PROPERTY_API_ALLOWED_ORIGINS', '')),
        'allowed_origins_patterns' => [],
        'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],
        'exposed_headers' => ['Content-Disposition', 'Content-Length', 'Retry-After'],
        'max_age' => 600,
        'supports_credentials' => false,
    ],
];
