<?php

return ['customer-actions' => ['driver' => 'single', 'path' => env('PROPERTY_CUSTOMER_MAIL_LOG', storage_path('logs/customer-actions.log')), 'level' => 'debug', 'permission' => 0600]];
