<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Webkul\Property\Models\Property;

it('serializes moderation decisions and content edits without approving stale revisions', function (string $mode) {
    $database = config('database.connections.mysql.database');
    expect($database)->toEndWith('_test');
    $actor = apiStaff([], visibility: 'global', all: true);
    $payload = apiPropertyPayload(['user_id' => $actor->id, 'city' => 'Moderation race '.Str::uuid(), 'is_published' => false, 'images' => []]);
    $property = Property::create($payload);
    $payload['title'] = 'Changed public title';
    $fixture = json_encode(['database' => $database, 'actor' => $actor->id, 'property' => $property->id, 'payload' => $payload, 'decisions' => ['approved', $mode === 'same' ? 'approved' : ($mode === 'edit' ? 'edit' : 'rejected')]]);
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
try{if($d==='edit'){$repo=app(Webkul\Property\Repositories\PropertyRepository::class);$p=$repo->authorized($f['property']);$repo->saveProperty($f['payload'],[],[],$p);$status='edited';}else{$r=app(Webkul\Property\Services\PropertyModerationService::class)->decide($f['property'],['expected_revision'=>1,'decision'=>$d,'reason'=>$d==='approved'?'Approved by staff':'Rejected by staff']);$status=$r['moderation_status'];}echo json_encode(['result'=>$status]);}
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
        } elseif ($mode === 'edit') {
            expect($results)->toContain('edited')->and($property->fresh()->moderation_status)->toBe('pending')->and($property->fresh()->moderation_revision)->toBe(2)->and($property->fresh()->title)->toBe('Changed public title');
        } else {
            expect($results)->toContain('conflict')->and(count(array_filter($results, fn ($r) => $r !== 'conflict')))->toBe(1);
        }
        $count = DB::table('property_moderation_events')->where('property_reference', $property->id)->whereIn('action', ['approved', 'rejected'])->count();
        expect($count)->toBe($mode === 'edit' && in_array('conflict', $results, true) ? 0 : 1);

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
})->with(['same', 'opposed', 'edit']);
