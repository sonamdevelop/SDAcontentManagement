<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stay_bookings', fn (Blueprint $t) => $t->unsignedInteger('created_by')->nullable()->change());
        Schema::table('stay_booking_events', fn (Blueprint $t) => $t->foreignId('customer_actor_id')->nullable()->constrained('stay_customers')->restrictOnDelete());
    }

    public function down(): void
    {
        if (DB::table('stay_bookings')->whereNull('created_by')->exists() || DB::table('stay_booking_events')->whereNotNull('customer_actor_id')->exists()) {
            throw new RuntimeException('Customer reservations must be preserved; refusing to remove their actor attribution.');
        }
        Schema::table('stay_booking_events', fn (Blueprint $t) => $t->dropConstrainedForeignId('customer_actor_id'));
        Schema::table('stay_bookings', fn (Blueprint $t) => $t->unsignedInteger('created_by')->nullable(false)->change());
    }
};
