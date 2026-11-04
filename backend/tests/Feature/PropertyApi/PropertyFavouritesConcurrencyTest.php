<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;

it('serializes concurrent saves into one membership per customer and property', function (string $mode) {
    $database = config('database.connections.mysql.database');
    expect($database)->toEndWith('_test');
    $actor = apiStaff([], visibility: 'global', all: true);
    $property = apiProperty($actor, ['city' => 'Favourite race '.Str::uuid()]);
    $make = fn () => Customer::create(['name' => 'Race customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $c = $make();
    $c2 = $mode === 'same' ? $c : $make();
    $fixture = json_encode(['database' => $database, 'property' => $property->id, 'customers' => [$c->id, $c2->id]]);
    $marker = tempnam(sys_get_temp_dir(), 'stay-race-');
    unlink($marker);
    $workers = [];
    $code = <<<'WORKER'
require $argv[1].'/vendor/autoload.php';
$app=require $argv[1].'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$f=json_decode($argv[2],true);if(config('database.connections.mysql.database')!==$f['database'])throw new RuntimeException('Test DB mismatch');
file_put_contents($argv[3].'.'.$argv[4].'.ready','ready');$end=microtime(true)+15;
while(!file_exists($argv[3].'.go')){if(microtime(true)>$end)throw new RuntimeException('Race barrier timeout');usleep(10000);}
app(Webkul\Property\Services\PropertyFavouriteService::class)->save($f['customers'][(int)$argv[4]-1],$f['property']);echo json_encode(['result'=>'saved']);
WORKER;
    try {
        foreach ([1, 2] as $n) {
            $pipes = [];
            $p = proc_open([PHP_BINARY, '-r', $code, base_path(), $fixture, $marker, (string) $n], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            if (! is_resource($p)) {
                throw new RuntimeException('Worker startup failed');
            }fclose($pipes[0]);
            $workers[] = ['p' => $p, 'pipes' => $pipes];
        }
        $end = microtime(true) + 15;
        while (! file_exists($marker.'.1.ready') || ! file_exists($marker.'.2.ready')) {
            if (microtime(true) > $end) {
                throw new RuntimeException('Workers not ready');
            }usleep(10000);
        }file_put_contents($marker.'.go', 'go');
        $results = [];
        foreach ($workers as &$w) {
            $out = stream_get_contents($w['pipes'][1]);
            $err = stream_get_contents($w['pipes'][2]);
            fclose($w['pipes'][1]);
            fclose($w['pipes'][2]);
            $exit = proc_close($w['p']);
            $w['p'] = null;
            if ($exit !== 0) {
                throw new RuntimeException($err.$out);
            }$result = json_decode($out, true, flags: JSON_THROW_ON_ERROR);
            $results[] = $result['result'];

        }unset($w);
        sort($results);
        expect($results)->toBe(['saved', 'saved']);
        expect(DB::table('customer_property_favourites')->where('property_id', $property->id)->count())->toBe($mode === 'same' ? 1 : 2);

    } finally {
        $property->update(['is_published' => false]);
        foreach ($workers as $w) {
            if (is_resource($w['p'])) {
                proc_terminate($w['p']);
                proc_close($w['p']);
            }
        }foreach (glob($marker.'*') as $file) {
            unlink($file);
        }
    }
    // Synthetic fixtures remain in the isolated test database; no database resets/deletes.
})->with(['same', 'distinct']);
