<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stay_cancellation_requests', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained('stay_bookings')->restrictOnDelete();
            $t->foreignId('customer_id')->constrained('stay_customers')->restrictOnDelete();
            $t->uuid('request_id')->unique();
            $t->char('payload_hash', 64);
            $t->string('status', 20)->default('pending');
            $t->text('reason');
            $t->text('decision_reason')->nullable();
            $t->unsignedInteger('decided_by')->nullable();
            $t->foreign('decided_by')->references('id')->on('users')->nullOnDelete();
            $t->timestamp('decided_at')->nullable();
            $t->timestamps();
            $t->index(['booking_id', 'status']);
            $t->index(['status', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stay_cancellation_requests');
    }
};
