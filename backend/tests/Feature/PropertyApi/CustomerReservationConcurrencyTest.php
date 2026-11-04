<?php

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBooking;

it('serializes customer/customer and customer/staff competition with identical request replay', function (string $mode) {
    $database = config('database.connections.mysql.database');
    expect($database)->toEndWith('_test');
    $actor = apiStaff([], visibility: 'global', all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Concurrent customer stay '.Str::uuid(), 'city' => 'Race city '.Str::uuid(), 'timezone' => 'Asia/Kolkata', 'active' => true, 'is_published' => true]);
    $room = $stay->rooms()->create(['name' => 'Last room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true, 'is_published' => true]);
    $customer = Customer::create(['name' => 'Concurrent customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $customer->forceFill(['email_verified_at' => now()])->save();
    $key = (string) Str::uuid();
    $fixture = json_encode(['database' => $database, 'actor' => $actor->id, 'customer' => $customer->id, 'mode' => $mode, 'keys' => [$key, $mode === 'same' ? $key : (string) Str::uuid()], 'payload' => ['room_type_id' => $room->id, 'check_in' => now('Asia/Kolkata')->addDays(5)->format('Y-m-d'), 'check_out' => now('Asia/Kolkata')->addDays(7)->format('Y-m-d'), 'rooms' => 1, 'guests' => 2, 'guest_name' => 'Concurrent guest', 'expected_rate' => '1000.25']]);
    $marker = tempnam(sys_get_temp_dir(), 'stay-race-');
    unlink($marker);
    $workers = [];
    $code = <<<'WORKER'
require $argv[1].'/vendor/autoload.php';
$app=require $argv[1].'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$f=json_decode($argv[2],true);if(config('database.connections.mysql.database')!==$f['database'])throw new RuntimeException('Test DB mismatch');
if($f['mode']==='mixed' && $argv[4]==='2'){auth()->guard('user')->setUser(app(Webkul\User\Repositories\UserRepository::class)->findOrFail($f['actor'])->withAccessToken(new Laravel\Sanctum\TransientToken));}
file_put_contents($argv[3].'.'.$argv[4].'.ready','ready');$end=microtime(true)+15;
while(!file_exists($argv[3].'.go')){if(microtime(true)>$end)throw new RuntimeException('Race barrier timeout');usleep(10000);}
$f['payload']['request_id']=$f['keys'][(int)$argv[4]-1];
try{if($f['mode']==='mixed' && $argv[4]==='2'){[, $created]=app(Webkul\Property\Services\StayBookingService::class)->reserve($f['payload']);}else{[, $created]=app(Webkul\Property\Services\CustomerReservationService::class)->reserve($f['customer'],$f['payload']);}echo json_encode(['result'=>$created?'created':'replayed']);}
catch(Illuminate\Validation\ValidationException $e){echo json_encode(['result'=>'conflict','fields'=>array_keys($e->errors())]);}
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
            if ($result['result'] === 'conflict') {
                expect($result['fields'])->toContain('rooms');
            }
        }unset($w);
        sort($results);
        expect($results)->toBe($mode === 'same' ? ['created', 'replayed'] : ['conflict', 'created']);
        $saved = StayBooking::where('room_type_id', $room->id)->get();
        expect($saved)->toHaveCount(1)->and($saved->first()->events()->count())->toBe(1);
    } finally {
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
})->with(['distinct', 'same', 'mixed']);
