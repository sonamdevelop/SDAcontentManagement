<?php

namespace Webkul\Property\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Webkul\Property\Console\Commands\CleanupPropertyDocuments;
use Webkul\Property\Http\Exceptions\ApiExceptionHandler;
use Webkul\Property\Http\Middleware\ApiCors;
use Webkul\Property\Http\Middleware\JsonApi;
use Webkul\Property\Support\CustomerIdentity;

class PropertyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../Config/filesystems.php', 'filesystems.disks');
        $this->mergeConfigFrom(__DIR__.'/../Config/api.php', 'property_api');
        $this->mergeConfigFrom(__DIR__.'/../Config/customer-mail.php', 'mail.mailers');
        $this->mergeConfigFrom(__DIR__.'/../Config/customer-logging.php', 'logging.channels');
        if (! $this->app->configurationIsCached()) {
            config(['acl' => array_merge(config('acl', []), require __DIR__.'/../Config/acl.php')]);
        }
    }

    public function boot(): void
    {
        $this->app->bind(ExceptionHandler::class, ApiExceptionHandler::class);
        $this->app->make(Kernel::class)->prependMiddleware(ApiCors::class);
        if ($this->app->runningInConsole()) {
            $this->commands([CleanupPropertyDocuments::class]);
            $this->callAfterResolving(Schedule::class, fn (Schedule $schedule) => $schedule->command('property-documents:cleanup')->hourly()->withoutOverlapping());
        }
        $this->loadMigrationsFrom(__DIR__.'/../Database/Migrations');
        RateLimiter::for('customer-register', fn ($request) => Limit::perMinute(5)->by('customer-register:'.$request->ip()));
        RateLimiter::for('customer-login', function ($request) {
            $email = is_string($request->input('email')) ? CustomerIdentity::email($request->input('email')) : '';

            return [Limit::perMinute(20)->by('customer-login-ip:'.$request->ip()), Limit::perMinute(5)->by('customer-login-email:'.$request->ip().':'.hash('sha256', $email))];
        });
        RateLimiter::for('customer-favourites', fn ($request) => Limit::perMinute(30)->by('customer-favourites:'.$request->ip()));
        RateLimiter::for('customer-cancellation', fn ($request) => Limit::perMinute(5)->by('customer-cancellation:'.$request->ip()));
        RateLimiter::for('customer-reservation', fn ($request) => Limit::perMinute(5)->by('customer-reservation:'.$request->ip()));
        RateLimiter::for('customer-recovery', function ($request) {
            $email = is_string($request->input('email')) ? CustomerIdentity::email($request->input('email')) : '';

            return [Limit::perMinute(10)->by('customer-recovery:'.$request->ip()), Limit::perMinute(3)->by('customer-recovery-email:'.hash('sha256', $email))];
        });
        RateLimiter::for('customer-verification', fn ($request) => Limit::perMinute(5)->by('customer-verification:'.$request->ip()));
        RateLimiter::for('customer-action-complete', fn ($request) => Limit::perMinute(10)->by('customer-action-complete:'.$request->ip()));
        RateLimiter::for('customer-password', fn ($request) => Limit::perMinute(5)->by('customer-password:'.$request->ip()));
        RateLimiter::for('property-api-login', fn ($request) => Limit::perMinute(5)->by($request->ip()));
        RateLimiter::for('property-api', fn ($request) => Limit::perMinute(120)->by($request->ip()));
        RateLimiter::for('property-api-enquiries', fn ($request) => Limit::perMinute(5)->by($request->ip()));
        Route::prefix('api/v1')->name('api.v1.')->middleware(['api', JsonApi::class, 'throttle:property-api'])
            ->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->group(__DIR__.'/../Routes/api.php');
    }
}
