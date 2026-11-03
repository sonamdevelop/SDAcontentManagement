<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stay_bookings', function (Blueprint $table) {
            $table->dateTime('checked_in_at')->nullable();
            $table->dateTime('checked_out_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('stay_bookings', fn (Blueprint $table) => $table->dropColumn(['checked_in_at', 'checked_out_at']));
    }
};
