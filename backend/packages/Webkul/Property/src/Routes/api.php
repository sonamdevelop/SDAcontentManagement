<?php

use Illuminate\Support\Facades\Route;
use Webkul\Property\Http\Controllers\AuthController;
use Webkul\Property\Http\Controllers\EnquiryApiController;
use Webkul\Property\Http\Controllers\FollowUpApiController;
use Webkul\Property\Http\Controllers\LeadApiController;
use Webkul\Property\Http\Controllers\PropertyApiController;
use Webkul\Property\Http\Controllers\ReportApiController;
use Webkul\Property\Http\Controllers\SiteVisitApiController;
use Webkul\Property\Http\Middleware\ApiAccess;

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:property-api-login')->name('auth.login');
Route::get('auth/me', [AuthController::class, 'me'])->middleware(ApiAccess::class)->name('auth.me');
Route::post('auth/logout', [AuthController::class, 'logout'])->middleware(ApiAccess::class)->name('auth.logout');
Route::get('properties', [PropertyApiController::class, 'index'])->name('properties.index');
Route::get('properties/{id}', [PropertyApiController::class, 'show'])->whereNumber('id')->name('properties.show');
Route::post('properties/{id}/enquiries', [EnquiryApiController::class, 'store'])->whereNumber('id')->middleware('throttle:property-api-enquiries')->name('enquiries.store');
Route::prefix('admin')->name('admin.')->group(function () {
    Route::get('properties', [PropertyApiController::class, 'adminIndex'])->middleware(ApiAccess::class.':properties,properties:read')->name('properties.index');
    Route::get('properties/{id}', [PropertyApiController::class, 'adminShow'])->whereNumber('id')->middleware(ApiAccess::class.':properties,properties:read')->name('properties.show');
    Route::post('properties', [PropertyApiController::class, 'store'])->middleware(ApiAccess::class.':properties.create,properties:write')->name('properties.store');
    Route::put('properties/{id}', [PropertyApiController::class, 'update'])->whereNumber('id')->middleware(ApiAccess::class.':properties.edit,properties:write')->name('properties.update');
    Route::delete('properties/{id}', [PropertyApiController::class, 'destroy'])->whereNumber('id')->middleware(ApiAccess::class.':properties.delete,properties:write')->name('properties.destroy');
    Route::get('enquiries', [EnquiryApiController::class, 'index'])->middleware(ApiAccess::class.':properties.enquiries,enquiries:read')->name('enquiries.index');
});

Route::prefix('admin')->name('admin.')->group(function () {
    $lead = LeadApiController::class;
    $followUp = FollowUpApiController::class;
    Route::get('leads', [$lead, 'index'])->middleware(ApiAccess::class.':leads,leads:read')->name('leads.index');
    Route::get('lead-pipelines', [$lead, 'pipelines'])->middleware(ApiAccess::class.':leads,leads:read')->name('leads.pipelines');
    Route::get('lead-assignees', [$lead, 'assignees'])->middleware(ApiAccess::class.':leads.assign,leads:write,leads.view')->name('leads.assignees');
    Route::get('leads/{id}', [$lead, 'show'])->whereNumber('id')->middleware(ApiAccess::class.':leads.view,leads:read')->name('leads.show');
    Route::patch('leads/{id}/assignment', [$lead, 'assign'])->whereNumber('id')->middleware(ApiAccess::class.':leads.assign,leads:write,leads.view')->name('leads.assign');
    Route::patch('leads/{id}/stage', [$lead, 'stage'])->whereNumber('id')->middleware(ApiAccess::class.':leads.edit,leads:write,leads.view')->name('leads.stage');
    Route::get('follow-ups', [$followUp, 'index'])->middleware(ApiAccess::class.':leads.view,leads:read')->name('followups.index');
    Route::get('leads/{id}/follow-ups', [$followUp, 'index'])->whereNumber('id')->middleware(ApiAccess::class.':leads.view,leads:read')->name('leads.followups.index');
    Route::post('leads/{id}/follow-ups', [$followUp, 'store'])->whereNumber('id')->middleware(ApiAccess::class.':leads.edit,leads:write,leads.view')->name('leads.followups.store');
    Route::patch('leads/{id}/follow-ups/{activityId}', [$followUp, 'update'])->whereNumber(['id', 'activityId'])->middleware(ApiAccess::class.':leads.edit,leads:write,leads.view')->name('leads.followups.update');
    Route::delete('leads/{id}/follow-ups/{activityId}', [$followUp, 'destroy'])->whereNumber(['id', 'activityId'])->middleware(ApiAccess::class.':leads.edit,leads:write,leads.view')->name('leads.followups.destroy');
});

Route::prefix('admin')->name('admin.')->group(function () {
    $visits = SiteVisitApiController::class;
    Route::get('site-visits', [$visits, 'index'])->middleware(ApiAccess::class.':visits,visits:read')->name('visits.index');
    Route::get('site-visit-agents', [$visits, 'agents'])->middleware(ApiAccess::class.':visits.view,visits:write')->name('visits.agents');
    Route::get('site-visits/{id}', [$visits, 'show'])->whereNumber('id')->middleware(ApiAccess::class.':visits.view,visits:read')->name('visits.show');
    Route::post('site-visits', [$visits, 'store'])->middleware(ApiAccess::class.':visits.create,visits:write,visits.view')->name('visits.store');
    Route::patch('site-visits/{id}/schedule', [$visits, 'schedule'])->whereNumber('id')->middleware(ApiAccess::class.':visits.edit,visits:write,visits.view')->name('visits.schedule');
    Route::patch('site-visits/{id}/assignment', [$visits, 'assign'])->whereNumber('id')->middleware(ApiAccess::class.':visits.assign,visits:write,visits.view')->name('visits.assign');
    Route::patch('site-visits/{id}/status', [$visits, 'status'])->whereNumber('id')->middleware(ApiAccess::class.':visits.edit,visits:write,visits.view')->name('visits.status');
    Route::patch('site-visits/{id}/feedback', [$visits, 'feedback'])->whereNumber('id')->middleware(ApiAccess::class.':visits.edit,visits:write,visits.view')->name('visits.feedback');
});

Route::get('admin/reports/overview', [ReportApiController::class, 'overview'])->middleware(ApiAccess::class.':property-reports,reports:read')->name('admin.reports.overview');
Route::get('admin/reports/agents', [ReportApiController::class, 'agents'])->middleware(ApiAccess::class.':property-reports.agents,reports:read,property-reports')->name('admin.reports.agents');

Route::fallback(fn () => response()->json(['message' => 'Not found.'], 404));
