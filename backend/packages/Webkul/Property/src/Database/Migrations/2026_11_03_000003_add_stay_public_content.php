<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['stays', 'stay_room_types'] as $table) {
            Schema::table($table, function (Blueprint $t) {
                $t->text('description')->nullable();
                $t->text('rules')->nullable();
                $t->json('amenities')->nullable();
                $t->json('images')->nullable();
                $t->boolean('is_published')->default(false);
            });
        }
    }

    public function down(): void
    {
        foreach (['stays', 'stay_room_types'] as $table) {
            Schema::table($table, fn (Blueprint $t) => $t->dropColumn(['description', 'rules', 'amenities', 'images', 'is_published']));
        }
    }
};
