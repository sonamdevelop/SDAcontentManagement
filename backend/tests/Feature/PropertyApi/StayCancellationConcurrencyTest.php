<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;
use Webkul\Property\Models\Stay;
use Webkul\Property\Services\CustomerReservationService;
use Webkul\Property\Services\StayCancellationService;

it('serializes simultaneous cancellation decisions without duplicate state changes', function (string $mode) {
    $database = config('database.connections.mysql.database');
    expect($database)->toEndWith('_test');
    $actor = apiStaff([], visibility: 'global', all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Cancellation race '.Str::uuid(), 'city' => 'Cancellation race city '.Str::uuid(), 'timezone' => 'Asia/Kolkata', 'active' => true, 'is_published' => true]);
    $room = $stay->rooms()->create(['name' => 'Race room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '1000.25', 'active' => true, 'is_published' => true]);
    $c = Customer::create(['name' => 'Race customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);
    $c->forceFill(['email_verified_at' => now()])->save();
    [$booking] = app(CustomerReservationService::class)->reserve($c->id, ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => now('Asia/Kolkata')->addDays(5)->format('Y-m-d'), 'check_out' => now('Asia/Kolkata')->addDays(7)->format('Y-m-d'), 'rooms' => 1, 'guests' => 1, 'guest_name' => 'Race guest', 'expected_rate' => '1000.25']);
    [$request] = app(StayCancellationService::class)->request($c->id, $booking->id, ['request_id' => (string) Str::uuid(), 'reason' => 'Travel changed']);
    $fixture = json_encode(['database' => $database, 'actor' => $actor->id, 'request' => $request->id, 'decisions' => ['approve', $mode === 'same' ? 'approve' : 'reject']]);
    $marker = tempnam(sys_get_temp_dir(), 'stay-race-');
    unlink($marker);
    $workers = [];
    $code = <<<'WORKER'
require $argv[1].'/vendor/autoload.php';
$app=require $argv[1].'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$f=json_decode($argv[2],true);if(config('database.connections.mysql.database')!==$f['database'])throw new RuntimeException('Test DB mismatch');
auth()->guard('user')->setUser(app(Webkul\User\Repositories\UserRepository::class)->findOrFail($f['actor'])->withAccessToken(new Laravel\Sanctum\TransientToken));
file_put_contents($argv[3].'.'.$argv[4].'.ready','ready');$end=microtime(true)+15;
while(!file_exists($argv[3].'.go')){if(microtime(true)>$end)throw new RuntimeException('Race barrier timeout');usleep(10000);}
$d=$f['decisions'][(int)$argv[4]-1];
try{$r=app(Webkul\Property\Services\StayCancellationService::class)->decision($f['request'],$d,$d==='approve'?'Approved by staff':'Rejected by staff');echo json_encode(['result'=>$r->status]);}
catch(Symfony\Component\HttpKernel\Exception\HttpException $e){if($e->getStatusCode()!==409)throw $e;echo json_encode(['result'=>'conflict']);}
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
        if ($mode === 'same') {
            expect($results)->toBe(['approved', 'approved']);
        } else {
            expect($results)->toContain('conflict')->and(count(array_filter($results, fn ($r) => $r !== 'conflict')))->toBe(1);
        }
        $final = DB::table('stay_cancellation_requests')->where('id', $request->id)->first();
        expect($booking->fresh()->status)->toBe($final->status === 'approved' ? 'cancelled' : 'confirmed');
        expect($booking->events()->whereIn('action', ['cancellation_approved', 'cancellation_rejected'])->count())->toBe(1);

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
})->with(['same', 'opposed']);
