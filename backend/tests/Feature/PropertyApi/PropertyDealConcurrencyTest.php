<?php

use Illuminate\Support\Str;
use Webkul\Contact\Repositories\PersonRepository;
use Webkul\Lead\Repositories\LeadRepository;
use Webkul\Property\Models\PropertyDealEvent;
use Webkul\Property\Repositories\PropertyDealRepository;
use Webkul\Property\Repositories\PropertyRepository;

it('serializes competing reservations and identical booking retries across real database processes', function ($sameKey) {
    $database = config('database.connections.mysql.database');
    expect($database)->toEndWith('_test');
    $actor = apiStaff([], visibility: 'global', all: true);
    $role = $actor->role;
    [$property, $lead, $person] = visitSources($actor);
    $marker = tempnam(sys_get_temp_dir(), 'deal-race-');
    unlink($marker);
    $workers = [];
    $request = (string) Str::uuid();
    $fixture = json_encode(['user_id' => $actor->id, 'database' => $database, 'keys' => [$request, $sameKey ? $request : (string) Str::uuid()], 'payload' => ['property_id' => $property->id, 'lead_id' => $lead->id, 'agreed_price' => '1000.01', 'booking_amount' => '100.01']]);
    $code = <<<'WORKER'
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$fixture = json_decode($argv[2], true);
if (config('database.connections.mysql.database') !== $fixture['database']) { throw new RuntimeException('Test database mismatch'); }
auth()->guard('user')->setUser(app(Webkul\User\Repositories\UserRepository::class)->findOrFail($fixture['user_id'])->withAccessToken(new Laravel\Sanctum\TransientToken));
$fixture['payload']['request_id'] = $fixture['keys'][(int) $argv[4] - 1];
$created = false;
try {
    Illuminate\Support\Facades\DB::transaction(function () use ($fixture, $argv, &$created) {
        // Establish a consistent-read snapshot before either worker books the slot.
        // Retry the entire root transaction, as Laravel does for top-level service calls.
        app(Webkul\Property\Repositories\PropertyRepository::class)->findOrFail($fixture['payload']['property_id']);
        file_put_contents($argv[3].'.'.$argv[4].'.ready', 'ready');
        $deadline = microtime(true) + 15;
        while (! file_exists($argv[3].'.go')) {
            if (microtime(true) > $deadline) { throw new RuntimeException('Race barrier timed out'); }
            usleep(10000);
        }
        [, $created] = app(Webkul\Property\Services\PropertyDealService::class)->reserve($fixture['payload']);
    }, 3);
    echo json_encode(['result' => $created ? 'created' : 'replayed']);
} catch (Illuminate\Validation\ValidationException $exception) {
    echo json_encode(['result' => 'conflict', 'fields' => array_keys($exception->errors())]);
}
WORKER;
    try {
        foreach ([1, 2] as $number) {
            $pipes = [];
            $process = proc_open([PHP_BINARY, '-r', $code, base_path(), $fixture, $marker, (string) $number], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
            if (! is_resource($process)) {
                throw new RuntimeException('Could not start concurrency worker');
            }
            fclose($pipes[0]);
            $workers[] = ['process' => $process, 'pipes' => $pipes];
        }
        $deadline = microtime(true) + 15;
        while (! file_exists($marker.'.1.ready') || ! file_exists($marker.'.2.ready')) {
            if (microtime(true) > $deadline) {
                throw new RuntimeException('Workers did not reach the booking barrier');
            }
            usleep(10000);
        }
        file_put_contents($marker.'.go', 'go');
        $results = [];
        foreach (array_keys($workers) as $index) {
            $worker = $workers[$index];
            $output = stream_get_contents($worker['pipes'][1]);
            $error = stream_get_contents($worker['pipes'][2]);
            fclose($worker['pipes'][1]);
            fclose($worker['pipes'][2]);
            $exit = proc_close($worker['process']);
            $workers[$index]['process'] = null;
            if ($exit !== 0) {
                throw new RuntimeException('Concurrency worker failed: '.$error.$output);
            }
            $result = json_decode($output, true, flags: JSON_THROW_ON_ERROR);
            $results[] = $result['result'];
            if ($result['result'] === 'conflict') {
                expect($result['fields'])->toContain('property_id');
            }
        }
        sort($results);
        expect($results)->toBe($sameKey ? ['created', 'replayed'] : ['conflict', 'created']);
        expect(app(PropertyDealRepository::class)->findByField('property_id', $property->id)->count())->toBe(1)
            ->and($property->refresh()->status)->toBe('reserved');
        expect(PropertyDealEvent::whereIn('deal_id', app(PropertyDealRepository::class)->findByField('property_id', $property->id)->modelKeys())->count())->toBe(1);
    } finally {
        foreach ($workers as $worker) {
            if (is_resource($worker['process'])) {
                proc_terminate($worker['process']);
                proc_close($worker['process']);
            }
        }
        foreach (glob($marker.'*') as $file) {
            unlink($file);
        }
        foreach (app(PropertyDealRepository::class)->findByField('property_id', $property->id) as $deal) {
            app(PropertyDealRepository::class)->delete($deal->id);
        }
        app(LeadRepository::class)->delete($lead->id);
        app(PersonRepository::class)->delete($person->id);
        app(PropertyRepository::class)->deleteProperty($property);
        $actor->delete();
        $role->delete();
    }
})->with([false, true]);
