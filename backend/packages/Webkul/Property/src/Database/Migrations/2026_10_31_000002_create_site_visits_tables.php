<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_visits', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('property_id')->nullable();
            $table->foreign('property_id')->references('id')->on('properties')->nullOnDelete();
            $table->unsignedInteger('lead_id')->nullable();
            $table->foreign('lead_id')->references('id')->on('leads')->nullOnDelete();
            $table->unsignedInteger('person_id')->nullable();
            $table->foreign('person_id')->references('id')->on('persons')->nullOnDelete();
            $table->unsignedInteger('user_id');
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->unsignedInteger('created_by')->nullable();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->string('property_title');
            $table->string('property_city', 100);
            $table->string('customer_name');
            $table->string('customer_email')->nullable();
            $table->string('customer_phone', 30)->nullable();
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->string('status', 20)->default('scheduled');
            $table->text('notes')->nullable();
            $table->text('feedback')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->dateTime('no_show_at')->nullable();
            $table->unsignedInteger('reschedule_count')->default(0);
            $table->dateTime('last_rescheduled_at')->nullable();
            $table->text('reschedule_reason')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status', 'starts_at']);
            $table->index(['property_id', 'status', 'starts_at']);
            $table->index(['person_id', 'status', 'starts_at']);
        });
        Schema::create('site_visit_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('site_visit_id');
            $table->foreign('site_visit_id')->references('id')->on('site_visits')->cascadeOnDelete();
            $table->unsignedInteger('actor_id')->nullable();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $table->string('action', 30);
            $table->json('changes');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_visit_events');
        Schema::dropIfExists('site_visits');
    }
};
