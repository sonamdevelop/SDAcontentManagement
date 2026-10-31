<?php

return [
    'property_documents' => [
        'driver' => 'local',
        'root' => storage_path('app/private/property-documents'),
        'visibility' => 'private',
        'directory_visibility' => 'private',
        'permissions' => ['file' => ['private' => 0600], 'dir' => ['private' => 0700]],
        'serve' => false,
        'throw' => true,
    ],
];
