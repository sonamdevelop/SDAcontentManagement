<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Webkul\Property\Models\Property;
use Webkul\Property\Models\PropertyDocument;
use Webkul\Property\Support\DocumentFilePolicy;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$database = DB::connection()->getDatabaseName();
if (! preg_match('/^sda_acceptance_[0-9a-f]+$/', $database)) {
    throw new RuntimeException('File recovery checks require an isolated acceptance database.');
}
$files = [];
foreach (Property::all() as $property) {
    foreach ($property->images ?? [] as $path) {
        $files[] = ['disk' => 'public', 'path' => $path, 'sha256' => null];
    }
}
foreach (PropertyDocument::all() as $document) {
    $files[] = ['disk' => DocumentFilePolicy::DISK, 'path' => $document->path, 'sha256' => $document->sha256];
}
if (count($files) < 2) {
    throw new RuntimeException('Expected synthetic public and private uploads.');
}
$root = base_path('.runtime/acceptance/'.$database.'-files');
$recovery = $root.'-restored';
foreach ($files as $file) {
    if (! preg_match('~^[a-zA-Z0-9_./-]+$~', $file['path']) || str_contains($file['path'], '..') || str_starts_with($file['path'], '/')) {
        throw new RuntimeException('Invalid synthetic file path.');
    }
    $bytes = Storage::disk($file['disk'])->get($file['path']);
    $checksum = hash('sha256', $bytes);
    if ($file['sha256'] !== null && ! hash_equals($file['sha256'], $checksum)) {
        throw new RuntimeException('Document metadata checksum mismatch.');
    }
    $relative = $file['disk'].'/'.$file['path'];
    foreach ([$root, $recovery] as $destination) {
        $target = $destination.'/'.$relative;
        if (! is_dir(dirname($target))) {
            mkdir(dirname($target), 0700, true);
        }
        if (file_exists($target)) {
            throw new RuntimeException('Refusing to overwrite existing recovery artifacts.');
        }
        if ($destination === $root) {
            file_put_contents($target, $bytes);
        } else {
            copy($root.'/'.$relative, $target);
        }
        chmod($target, 0600);
        if (! hash_equals($checksum, hash_file('sha256', $target))) {
            throw new RuntimeException('Recovered upload checksum mismatch.');
        }
    }
}
echo 'Synthetic public/private uploads backed up and restored with SHA-256 verification: '.count($files).PHP_EOL;
