<?php

use Illuminate\Support\Facades\Route;
use Webkul\Property\Http\Controllers\AuthController;
use Webkul\Property\Http\Controllers\EnquiryApiController;
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
Route::fallback(fn () => response()->json(['message' => 'Not found.'], 404));
