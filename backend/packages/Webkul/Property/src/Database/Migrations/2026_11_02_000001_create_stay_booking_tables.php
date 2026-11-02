<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stays', function (Blueprint $t) {
            $t->id();
            $t->unsignedInteger('user_id');
            $t->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $t->string('name');
            $t->string('city', 100);
            $t->string('timezone', 64);
            $t->boolean('active')->default(true);
            $t->timestamps();
            $t->index('user_id');
        });
        Schema::create('stay_room_types', function (Blueprint $t) {
            $t->id();
            $t->foreignId('stay_id')->constrained('stays')->restrictOnDelete();
            $t->string('name');
            $t->unsignedSmallInteger('inventory');
            $t->unsignedSmallInteger('capacity');
            $t->decimal('nightly_rate', 15, 2);
            $t->boolean('active')->default(true);
            $t->timestamps();
        });
        Schema::create('stay_bookings', function (Blueprint $t) {
            $t->id();
            $t->uuid('request_id')->unique();
            $t->char('payload_hash', 64);
            $t->foreignId('room_type_id')->constrained('stay_room_types')->restrictOnDelete();
            foreach (['user_id', 'created_by'] as $field) {
                $t->unsignedInteger($field);
                $t->foreign($field)->references('id')->on('users')->restrictOnDelete();
            }
            $t->string('stay_name');
            $t->string('room_name');
            $t->string('timezone', 64);
            $t->date('check_in');
            $t->date('check_out');
            $t->unsignedSmallInteger('rooms');
            $t->unsignedSmallInteger('guests');
            $t->string('guest_name', 150);
            $t->string('guest_email')->nullable();
            $t->string('guest_phone', 30)->nullable();
            foreach (['nightly_rate', 'total', 'advance'] as $field) {
                $t->decimal($field, 15, 2);
            }
            $t->string('currency', 3);
            $t->string('payment_reference', 190)->nullable();
            $t->text('notes')->nullable();
            $t->string('status', 20)->default('confirmed');
            $t->dateTime('cancelled_at')->nullable();
            $t->text('cancellation_reason')->nullable();
            $t->timestamps();
            $t->index(['room_type_id', 'status', 'check_in', 'check_out']);
            $t->index(['user_id', 'id']);
        });
        Schema::create('stay_booking_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('booking_id')->constrained('stay_bookings')->restrictOnDelete();
            $t->unsignedInteger('actor_id')->nullable();
            $t->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $t->string('action', 30);
            $t->json('changes');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stay_booking_events');
        Schema::dropIfExists('stay_bookings');
        Schema::dropIfExists('stay_room_types');
        Schema::dropIfExists('stays');
    }
};
