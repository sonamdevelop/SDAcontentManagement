<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('properties', function (Blueprint $t) {
            $t->string('moderation_status', 20)->default('pending')->index();
            $t->unsignedInteger('moderation_revision')->default(1);
            $t->text('moderation_reason')->nullable();
            $t->unsignedInteger('moderated_by')->nullable();
            $t->foreign('moderated_by')->references('id')->on('users')->nullOnDelete();
            $t->timestamp('moderated_at')->nullable();
        });
        Schema::create('property_moderation_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('property_id')->nullable()->constrained('properties')->nullOnDelete();
            $t->unsignedBigInteger('property_reference');
            $t->unsignedInteger('revision');
            $t->string('action', 30);
            $t->unsignedInteger('actor_id')->nullable();
            $t->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $t->text('reason');
            $t->json('snapshot')->nullable();
            $t->timestamps();
            $t->index(['property_reference', 'id']);
        });
        // Preserve existing public availability, without attributing human approval to an invented actor.
        DB::table('properties')->where('is_published', true)->orderBy('id')->chunkById(200, function ($rows) {
            foreach ($rows as $row) {
                DB::table('properties')->where('id', $row->id)->update(['moderation_status' => 'approved']);
                DB::table('property_moderation_events')->insert(['property_id' => $row->id, 'property_reference' => $row->id, 'revision' => 1, 'action' => 'legacy_approved', 'actor_id' => null, 'reason' => 'Existing published listing retained during moderation upgrade.', 'snapshot' => null, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('property_moderation_events');
        Schema::table('properties', function (Blueprint $t) {
            $t->dropForeign(['moderated_by']);
            $t->dropColumn(['moderation_status', 'moderation_revision', 'moderation_reason', 'moderated_by', 'moderated_at']);
        });
    }
};
