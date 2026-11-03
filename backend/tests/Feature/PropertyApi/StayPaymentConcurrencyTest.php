<?php

use Illuminate\Support\Str;
use Webkul\Property\Models\Stay;
use Webkul\Property\Models\StayBookingEvent;
use Webkul\Property\Models\StayPayment;

it('serializes competing ledger writes and identical retries without exceeding money limits', function (string $scenario) {
    $database = config('database.connections.mysql.database');
    expect($database)->toEndWith('_test');
    $actor = apiStaff([], visibility: 'global', all: true);
    $stay = Stay::create(['user_id' => $actor->id, 'name' => 'Ledger race '.Str::uuid(), 'city' => 'Dandeli', 'timezone' => 'Asia/Kolkata', 'active' => true]);
    $room = $stay->rooms()->create(['name' => 'Race room', 'inventory' => 1, 'capacity' => 2, 'nightly_rate' => '100.00', 'active' => true]);
    $kind = str_contains($scenario, 'refund') ? 'refund' : ($scenario === 'reverse' ? 'reversal' : 'payment');
    $advance = $kind === 'payment' ? '0.00' : '100.00';
    $h = apiHeaders($actor, ['stays:read', 'bookings:read', 'bookings:write']);
    $id = $this->postJson('/api/v1/admin/stay-bookings', ['request_id' => (string) Str::uuid(), 'room_type_id' => $room->id, 'check_in' => '2030-01-01', 'check_out' => '2030-01-03', 'rooms' => 1, 'guests' => 1, 'guest_name' => 'Ledger race guest', 'expected_rate' => '100.00', 'advance' => $advance], $h)->assertCreated()->json('data.id');
    $key = (string) Str::uuid();
    $same = str_starts_with($scenario, 'same');
    $target = StayPayment::where('booking_id', $id)->value('id');
    $fixture = json_encode(['database' => $database, 'actor' => $actor->id, 'booking' => $id, 'kind' => $kind, 'target' => $target, 'keys' => [$key, $same ? $key : (string) Str::uuid()], 'data' => $kind === 'reversal' ? ['reason' => 'Wrong advance'] : ['amount' => $kind === 'payment' ? '150.00' : '75.00', 'method' => 'cash', 'reason' => 'Recorded offline']]);
    $marker = tempnam(sys_get_temp_dir(), 'ledger-race-');
    unlink($marker);
    $workers = [];
    $code = <<<'WORKER'
require $argv[1].'/vendor/autoload.php';$app=require $argv[1].'/bootstrap/app.php';$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();$f=json_decode($argv[2],true);if(config('database.connections.mysql.database')!==$f['database'])throw new RuntimeException('Test DB mismatch');
auth()->guard('user')->setUser(app(Webkul\User\Repositories\UserRepository::class)->findOrFail($f['actor'])->withAccessToken(new Laravel\Sanctum\TransientToken));
file_put_contents($argv[3].'.'.$argv[4].'.ready','ready');$end=microtime(true)+15;while(!file_exists($argv[3].'.go')){if(microtime(true)>$end)throw new RuntimeException('Race timeout');usleep(10000);}
$f['data']['request_id']=$f['keys'][(int)$argv[4]-1];
try{[, ,$created]=app(Webkul\Property\Services\StayPaymentService::class)->record($f['booking'],$f['kind'],$f['data'],$f['kind']==='reversal'?$f['target']:null);echo json_encode(['result'=>$created?'created':'replayed']);}
catch(Illuminate\Validation\ValidationException $e){echo json_encode(['result'=>'conflict']);}
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
            }$results[] = json_decode($out, true, flags: JSON_THROW_ON_ERROR)['result'];
        }unset($w);
        sort($results);
        expect($results)->toBe($same ? ['created', 'replayed'] : ['conflict', 'created']);
        expect(StayPayment::where('booking_id', $id)->count())->toBe($kind === 'payment' ? 1 : 2)->and(StayBookingEvent::where('booking_id', $id)->count())->toBe(2);
        $this->getJson('/api/v1/admin/stay-bookings/'.$id.'/payments', $h)->assertOk()->assertJsonPath('summary.net_paid', $kind === 'payment' ? '150.00' : ($kind === 'refund' ? '25.00' : '0.00'));
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
})->with(['payment', 'same_payment', 'refund', 'same_refund', 'reverse']);
