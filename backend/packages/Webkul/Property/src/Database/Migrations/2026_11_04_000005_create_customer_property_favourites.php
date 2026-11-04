<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_property_favourites', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained('stay_customers')->cascadeOnDelete();
            $t->foreignId('property_id')->constrained('properties')->cascadeOnDelete();
            $t->timestamp('created_at');
            $t->unique(['customer_id', 'property_id']);
            $t->index(['customer_id', 'id']);
            $t->index('property_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_property_favourites');
    }
};
