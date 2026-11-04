<?php

use Illuminate\Support\Facades\Route;
use Webkul\Property\Http\Controllers\AuthController;
use Webkul\Property\Http\Controllers\CustomerAccountController;
use Webkul\Property\Http\Controllers\CustomerActionController;
use Webkul\Property\Http\Controllers\CustomerStayBookingController;
use Webkul\Property\Http\Controllers\EnquiryApiController;
use Webkul\Property\Http\Controllers\FollowUpApiController;
use Webkul\Property\Http\Controllers\LeadApiController;
use Webkul\Property\Http\Controllers\PropertyApiController;
use Webkul\Property\Http\Controllers\PropertyDealApiController;
use Webkul\Property\Http\Controllers\PropertyDocumentApiController;
use Webkul\Property\Http\Controllers\PropertyFavouriteController;
use Webkul\Property\Http\Controllers\PropertyModerationController;
use Webkul\Property\Http\Controllers\ReportApiController;
use Webkul\Property\Http\Controllers\SiteVisitApiController;
use Webkul\Property\Http\Controllers\StayApiController;
use Webkul\Property\Http\Controllers\StayCancellationController;
use Webkul\Property\Http\Controllers\StayContentController;
use Webkul\Property\Http\Controllers\StayOperationsController;
use Webkul\Property\Http\Controllers\StayPaymentController;
use Webkul\Property\Http\Controllers\StayPaymentFollowUpController;
use Webkul\Property\Http\Controllers\StayReportController;
use Webkul\Property\Http\Middleware\ApiAccess;
use Webkul\Property\Http\Middleware\CustomerAccess;

Route::prefix('customer')->name('customer.')->group(function () {
    $actions = CustomerActionController::class;
    Route::post('auth/forgot-password', [$actions, 'forgot'])->middleware('throttle:customer-recovery')->name('forgot-password');
    Route::post('auth/reset-password', [$actions, 'reset'])->middleware('throttle:customer-action-complete')->name('reset-password');
    Route::post('auth/verify-email', [$actions, 'verify'])->middleware('throttle:customer-action-complete')->name('verify-email');
    Route::post('email/verification', [$actions, 'resend'])->middleware([CustomerAccess::class, 'throttle:customer-verification'])->name('verification-resend');
    $account = CustomerAccountController::class;
    $access = CustomerAccess::class;
    Route::post('auth/register', [$account, 'register'])->middleware('throttle:customer-register')->name('register');
    Route::post('auth/login', [$account, 'login'])->middleware('throttle:customer-login')->name('login');
    Route::middleware($access)->group(function () use ($account) {
        Route::get('me', [$account, 'me'])->name('me');
        Route::patch('me', [$account, 'update'])->name('profile');
        Route::post('auth/logout', [$account, 'logout'])->name('logout');
        Route::post('password', [$account, 'password'])->middleware('throttle:customer-password')->name('password');
    });
    $favourites = PropertyFavouriteController::class;
    Route::get('favourites', [$favourites, 'index'])->middleware($access.':customer:favourites')->name('favourites.index');
    Route::get('favourites/{id}', [$favourites, 'status'])->whereNumber('id')->middleware($access.':customer:favourites')->name('favourites.status');
    Route::put('favourites/{id}', [$favourites, 'store'])->whereNumber('id')->middleware([$access.':customer:favourites', 'throttle:customer-favourites'])->name('favourites.store');
    Route::delete('favourites/{id}', [$favourites, 'destroy'])->whereNumber('id')->middleware([$access.':customer:favourites', 'throttle:customer-favourites'])->name('favourites.destroy');
    Route::get('rooms/{id}/availability', [CustomerStayBookingController::class, 'availability'])->whereNumber('id')->middleware($access.':customer:bookings')->name('rooms.availability');
    Route::post('bookings', [CustomerStayBookingController::class, 'store'])->middleware([$access.':customer:bookings', $access.':customer:bookings:create', 'throttle:customer-reservation'])->name('bookings.store');
    Route::get('bookings', [CustomerStayBookingController::class, 'index'])->middleware($access.':customer:bookings')->name('bookings.index');
    Route::post('bookings/{id}/cancellation-requests', [StayCancellationController::class, 'store'])->whereNumber('id')->middleware([$access.':customer:bookings', $access.':customer:bookings:create', 'throttle:customer-cancellation'])->name('bookings.cancellation-request');
    Route::get('bookings/{id}', [CustomerStayBookingController::class, 'show'])->whereNumber('id')->middleware($access.':customer:bookings')->name('bookings.show');
});

Route::get('stays', [StayContentController::class, 'index'])->name('stays.index');
Route::get('stays/{id}', [StayContentController::class, 'show'])->whereNumber('id')->name('stays.show');
Route::get('admin/stays/{id}/content', [StayContentController::class, 'edit'])->whereNumber('id')->middleware(ApiAccess::class.':stays,stays:read')->name('admin.stays.content');
Route::post('admin/stays/{stayId}/content', [StayContentController::class, 'save'])->whereNumber('stayId')->middleware(ApiAccess::class.':stays.manage,stays:write,stays')->name('admin.stays.content-save');
Route::post('admin/stays/{stayId}/rooms/{id}/content', [StayContentController::class, 'save'])->whereNumber(['stayId', 'id'])->middleware(ApiAccess::class.':stays.manage,stays:write,stays')->name('admin.rooms.content-save');

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:property-api-login')->name('auth.login');
Route::get('auth/me', [AuthController::class, 'me'])->middleware(ApiAccess::class)->name('auth.me');
Route::post('auth/logout', [AuthController::class, 'logout'])->middleware(ApiAccess::class)->name('auth.logout');
Route::get('properties', [PropertyApiController::class, 'index'])->name('properties.index');
Route::get('properties/{id}', [PropertyApiController::class, 'show'])->whereNumber('id')->name('properties.show');
Route::post('properties/{id}/enquiries', [EnquiryApiController::class, 'store'])->whereNumber('id')->middleware('throttle:property-api-enquiries')->name('enquiries.store');
Route::prefix('admin')->name('admin.')->group(function () {
    Route::get('property-favourites', [PropertyFavouriteController::class, 'popularity'])->middleware(ApiAccess::class.':properties,properties:read')->name('favourites.popularity');
    Route::get('property-moderation', [PropertyModerationController::class, 'index'])->middleware(ApiAccess::class.':properties,properties:read')->name('moderation.index');
    Route::get('properties/{id}/moderation', [PropertyModerationController::class, 'show'])->whereNumber('id')->middleware(ApiAccess::class.':properties,properties:read')->name('moderation.show');
    Route::patch('properties/{id}/moderation', [PropertyModerationController::class, 'decide'])->whereNumber('id')->middleware(ApiAccess::class.':properties.moderate,properties:moderate,properties')->name('moderation.decide');
    Route::post('properties/{id}/moderation/submit', [PropertyModerationController::class, 'submit'])->whereNumber('id')->middleware(ApiAccess::class.':properties.edit,properties:write,properties')->name('moderation.submit');
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
Route::get('admin/reports/agents/export', [ReportApiController::class, 'export'])->middleware(ApiAccess::class.':property-reports.agents,reports:read,property-reports')->name('admin.reports.agents-export');
Route::get('admin/reports/agents', [ReportApiController::class, 'agents'])->middleware(ApiAccess::class.':property-reports.agents,reports:read,property-reports')->name('admin.reports.agents');

Route::prefix('admin/properties/{propertyId}/documents')->whereNumber('propertyId')->name('admin.properties.documents.')->group(function () {
    Route::get('', [PropertyDocumentApiController::class, 'index'])->middleware(ApiAccess::class.':properties.documents,documents:read,properties')->name('index');
    Route::post('', [PropertyDocumentApiController::class, 'store'])->middleware(ApiAccess::class.':properties.documents.create,documents:write,properties')->name('store');
    Route::get('{id}/download', [PropertyDocumentApiController::class, 'download'])->whereNumber('id')->middleware(ApiAccess::class.':properties.documents,documents:read,properties')->name('download');
    Route::delete('{id}', [PropertyDocumentApiController::class, 'destroy'])->whereNumber('id')->middleware(ApiAccess::class.':properties.documents.delete,documents:write,properties')->name('destroy');
});

Route::prefix('admin/property-deals')->name('admin.deals.')->group(function () {
    Route::get('', [PropertyDealApiController::class, 'index'])->middleware(ApiAccess::class.':deals,deals:read')->name('index');
    Route::post('', [PropertyDealApiController::class, 'store'])->middleware(ApiAccess::class.':deals.create,deals:write,deals.view')->name('store');
    Route::get('{id}', [PropertyDealApiController::class, 'show'])->whereNumber('id')->middleware(ApiAccess::class.':deals.view,deals:read')->name('show');
    Route::patch('{id}/confirm', [PropertyDealApiController::class, 'confirm'])->whereNumber('id')->middleware(ApiAccess::class.':deals.confirm,deals:write,deals.view')->name('confirm');
    Route::patch('{id}/cancel', [PropertyDealApiController::class, 'cancel'])->whereNumber('id')->middleware(ApiAccess::class.':deals.cancel,deals:write,deals.view')->name('cancel');
});

Route::prefix('admin')->name('admin.')->group(function () {
    $stays = StayApiController::class;
    Route::get('stays', [$stays, 'stays'])->middleware(ApiAccess::class.':stays,stays:read')->name('stays.index');
    Route::post('stays', [$stays, 'stay'])->middleware(ApiAccess::class.':stays.manage,stays:write,stays')->name('stays.store');
    Route::put('stays/{id}', [$stays, 'stay'])->whereNumber('id')->middleware(ApiAccess::class.':stays.manage,stays:write,stays')->name('stays.update');
    Route::post('stays/{stayId}/rooms', [$stays, 'room'])->whereNumber('stayId')->middleware(ApiAccess::class.':stays.manage,stays:write,stays')->name('rooms.store');
    Route::put('stays/{stayId}/rooms/{id}', [$stays, 'room'])->whereNumber(['stayId', 'id'])->middleware(ApiAccess::class.':stays.manage,stays:write,stays')->name('rooms.update');
    Route::get('stay-rooms/{id}/calendar', [$stays, 'calendar'])->whereNumber('id')->middleware(ApiAccess::class.':stays,stays:read')->name('rooms.calendar');
    Route::get('stay-rooms/{id}/availability', [$stays, 'availability'])->whereNumber('id')->middleware(ApiAccess::class.':stays,stays:read')->name('rooms.availability');
    Route::get('stay-bookings', [$stays, 'index'])->middleware(ApiAccess::class.':stay-bookings,bookings:read')->name('bookings.index');
    Route::get('stay-cancellation-requests', [StayCancellationController::class, 'index'])->middleware(ApiAccess::class.':stay-bookings,bookings:read,stay-bookings.view')->name('cancellation-requests.index');
    Route::patch('stay-cancellation-requests/{id}/decision', [StayCancellationController::class, 'decision'])->whereNumber('id')->middleware(ApiAccess::class.':stay-bookings.cancel,bookings:write,stay-bookings.view')->name('cancellation-requests.decision');
    Route::get('stay-bookings/{id}', [$stays, 'show'])->whereNumber('id')->middleware(ApiAccess::class.':stay-bookings.view,bookings:read')->name('bookings.show');
    Route::post('stay-bookings', [$stays, 'store'])->middleware([ApiAccess::class.':stay-bookings.create,bookings:write,stay-bookings.view', ApiAccess::class.':stays,stays:read'])->name('bookings.store');
    Route::patch('stay-bookings/{id}/check-in', [$stays, 'checkIn'])->whereNumber('id')->middleware(ApiAccess::class.':stay-bookings.check-in,bookings:write,stay-bookings.view')->name('bookings.check-in');
    Route::patch('stay-bookings/{id}/check-out', [$stays, 'checkOut'])->whereNumber('id')->middleware(ApiAccess::class.':stay-bookings.check-out,bookings:write,stay-bookings.view')->name('bookings.check-out');
    Route::patch('stay-bookings/{id}/cancel', [$stays, 'cancel'])->whereNumber('id')->middleware(ApiAccess::class.':stay-bookings.cancel,bookings:write,stay-bookings.view')->name('bookings.cancel');
});

Route::prefix('admin/stay-bookings/{id}')->whereNumber('id')->name('admin.booking-payments.')->group(function () {
    $payments = StayPaymentController::class;
    Route::get('statement', [$payments, 'statement'])->middleware(ApiAccess::class.':stay-bookings.payments,bookings:read,stay-bookings.view')->name('statement');
    Route::get('payments', [$payments, 'index'])->middleware(ApiAccess::class.':stay-bookings.payments,bookings:read,stay-bookings.view')->name('index');
    foreach (['payments' => ['payment', 'create'], 'refunds' => ['refund', 'refund']] as $path => [$method,$permission]) {
        Route::post($path, [$payments, $method])->middleware([ApiAccess::class.':stay-bookings.payments.'.$permission.',bookings:write,stay-bookings.view', ApiAccess::class.':stay-bookings.payments,bookings:read'])->name($method);
    }
    Route::post('payments/{entryId}/reverse', [$payments, 'reverse'])->whereNumber('entryId')->middleware([ApiAccess::class.':stay-bookings.payments.reverse,bookings:write,stay-bookings.view', ApiAccess::class.':stay-bookings.payments,bookings:read'])->name('reverse');
});

Route::get('admin/stays/{id}/payment-follow-ups', [StayPaymentFollowUpController::class, 'index'])->whereNumber('id')->middleware([ApiAccess::class.':stays,stays:read', ApiAccess::class.':stay-bookings,bookings:read,stay-bookings.view', ApiAccess::class.':stay-bookings.payments,bookings:read'])->name('admin.stays.payment-follow-ups');

Route::get('admin/stays/{id}/operations', [StayOperationsController::class, 'index'])->whereNumber('id')->middleware([ApiAccess::class.':stays,stays:read', ApiAccess::class.':stay-bookings,bookings:read,stay-bookings.view'])->name('admin.stays.operations');

Route::get('admin/stays/{id}/report', [StayReportController::class, 'index'])->whereNumber('id')->middleware([ApiAccess::class.':stays,stays:read', ApiAccess::class.':stay-bookings,bookings:read,stay-bookings.view', ApiAccess::class.':stay-bookings.payments,bookings:read'])->name('admin.stays.report');
Route::get('admin/stays/{id}/report/export', [StayReportController::class, 'export'])->whereNumber('id')->middleware([ApiAccess::class.':stays,stays:read', ApiAccess::class.':stay-bookings,bookings:read,stay-bookings.view', ApiAccess::class.':stay-bookings.payments,bookings:read'])->name('admin.stays.report.export');

Route::fallback(fn () => response()->json(['message' => 'Not found.'], 404));
