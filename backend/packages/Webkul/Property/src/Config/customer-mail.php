<?php

return [
    'customer_log' => ['transport' => 'log', 'channel' => 'customer-actions'],
    'customer_smtp' => ['transport' => 'smtp', 'host' => env('MAIL_HOST', 'localhost'), 'port' => env('MAIL_PORT', 587), 'encryption' => env('MAIL_ENCRYPTION', 'tls'), 'username' => env('MAIL_USERNAME'), 'password' => env('MAIL_PASSWORD'), 'timeout' => 10, 'verify_peer' => true],
];
