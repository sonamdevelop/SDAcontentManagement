<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('property_deals', function (Blueprint $table) {
            $table->id();
            $table->uuid('request_id')->unique();
            $table->char('payload_hash', 64);
            $table->foreignId('property_id')->nullable()->constrained('properties')->nullOnDelete();
            // Reserved and confirmed deals retain this guard; cancelled deals release it.
            $table->foreignId('active_property_id')->nullable()->unique()->constrained('properties')->nullOnDelete();
            foreach (['lead_id' => 'leads', 'person_id' => 'persons', 'created_by' => 'users'] as $column => $target) {
                $table->unsignedInteger($column)->nullable();
                $table->foreign($column)->references('id')->on($target)->nullOnDelete();
            }
            $table->unsignedInteger('user_id');
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->string('property_title');
            $table->string('property_city', 100);
            $table->string('purpose', 10);
            $table->string('rent_period', 10)->nullable();
            $table->string('customer_name');
            $table->string('customer_email')->nullable();
            $table->string('customer_phone', 30)->nullable();
            $table->string('currency', 3);
            $table->decimal('agreed_price', 15, 2);
            $table->decimal('booking_amount', 15, 2)->default(0);
            $table->string('payment_reference', 190)->nullable();
            $table->text('notes')->nullable();
            $table->string('status', 20)->default('reserved');
            $table->dateTime('confirmed_at')->nullable();
            $table->dateTime('cancelled_at')->nullable();
            $table->text('cancellation_reason')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'status', 'created_at']);
            $table->index(['property_id', 'created_at']);
        });
        Schema::create('property_deal_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('deal_id')->constrained('property_deals')->cascadeOnDelete();
            $table->unsignedInteger('actor_id')->nullable();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $table->string('action', 30);
            $table->json('changes');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_deal_events');
        Schema::dropIfExists('property_deals');
    }
};
