<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stay_customers', function (Blueprint $t) {
            $t->id();
            $t->string('name', 150);
            $t->string('email')->unique();
            $t->string('phone', 30)->nullable();
            $t->string('password');
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
        Schema::table('stay_bookings', function (Blueprint $t) {
            $t->foreignId('customer_id')->nullable()->constrained('stay_customers')->restrictOnDelete();
            $t->index(['customer_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::table('stay_bookings', function (Blueprint $t) {
            $t->dropIndex(['customer_id', 'id']);
            $t->dropConstrainedForeignId('customer_id');
        });
        Schema::dropIfExists('stay_customers');
    }
};
