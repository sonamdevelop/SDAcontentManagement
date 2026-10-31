<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('properties', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('purpose', 10)->index();
            $table->string('property_type', 30)->index();
            $table->decimal('price', 15, 2)->index();
            $table->string('rent_period', 10)->nullable();
            $table->decimal('area', 12, 2);
            $table->string('area_unit', 10);
            $table->unsignedTinyInteger('bedrooms')->nullable();
            $table->unsignedTinyInteger('bathrooms')->nullable();
            $table->string('address', 500);
            $table->string('city', 100)->index();
            $table->string('state', 100);
            $table->string('postal_code', 20)->nullable();
            $table->string('owner_name');
            $table->string('owner_phone', 30)->nullable();
            $table->string('status', 20)->default('available')->index();
            $table->unsignedInteger('user_id');
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->json('images')->nullable();
            $table->boolean('accepts_enquiries')->default(false);
            $table->boolean('is_published')->default(false)->index();
            $table->timestamps();
        });
        Schema::create('property_enquiries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('property_id')->nullable();
            $table->foreign('property_id')->references('id')->on('properties')->nullOnDelete();
            $table->string('property_title');
            $table->unsignedInteger('user_id');
            $table->foreign('user_id')->references('id')->on('users')->restrictOnDelete();
            $table->unsignedInteger('lead_id')->nullable();
            $table->foreign('lead_id')->references('id')->on('leads')->nullOnDelete();
            $table->uuid('submission_id');
            $table->char('payload_hash', 64);
            $table->unique(['property_id', 'submission_id']);
            $table->string('name', 150);
            $table->string('email');
            $table->string('phone', 30)->nullable();
            $table->text('message');
            $table->timestamp('consented_at');
            $table->timestamps();
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_enquiries');
        Schema::dropIfExists('properties');
    }
};
