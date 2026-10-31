<?php

use Illuminate\Support\Facades\Route;
use Webkul\Property\Http\Controllers\AuthController;
use Webkul\Property\Http\Controllers\EnquiryApiController;
use Webkul\Property\Http\Controllers\FollowUpApiController;
use Webkul\Property\Http\Controllers\LeadApiController;
use Webkul\Property\Http\Controllers\PropertyApiController;
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

Route::fallback(fn () => response()->json(['message' => 'Not found.'], 404));
