<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stay_customers', fn (Blueprint $t) => $t->timestamp('email_verified_at')->nullable());
        Schema::create('stay_customer_actions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('customer_id')->constrained('stay_customers')->cascadeOnDelete();
            $t->string('purpose', 20);
            $t->string('email');
            $t->char('token_hash', 64);
            $t->timestamp('expires_at');
            $t->timestamp('consumed_at')->nullable();
            $t->timestamps();
            $t->unique(['customer_id', 'purpose']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stay_customer_actions');
        Schema::table('stay_customers', fn (Blueprint $t) => $t->dropColumn('email_verified_at'));
    }
};
