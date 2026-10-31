<?php

use Illuminate\Contracts\Console\Kernel;
use Webkul\Installer\Database\Seeders\DatabaseSeeder;
use Webkul\Installer\Helpers\DatabaseManager;
use Webkul\User\Models\Role;
use Webkul\User\Models\User;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
if (! config('app.key')) {
    if ($kernel->call('key:generate', ['--force' => true]) !== 0) {
        throw new RuntimeException('Key generation failed');
    }
}
if ($kernel->call('migrate', ['--force' => true]) !== 0) {
    throw new RuntimeException('Migration failed');
}
echo $kernel->output();
if (User::count() === 0 && Role::count() === 0) {
    $app->make(DatabaseSeeder::class)->run(['locale' => 'en', 'currency' => 'INR']);
    echo "Initialized empty development database.\n";
} else {
    echo "Existing data preserved.\n";
}
if (! file_exists(public_path('storage'))) {
    $kernel->call('storage:link');
}
if (User::exists()) {
    $app->make(DatabaseManager::class)->markInstallationCompleted();
    touch(storage_path('installed'));
}
