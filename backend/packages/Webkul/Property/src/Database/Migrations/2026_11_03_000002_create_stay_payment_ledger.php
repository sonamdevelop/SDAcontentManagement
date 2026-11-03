<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stay_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained('stay_bookings')->restrictOnDelete();
            $table->uuid('request_id')->unique();
            $table->char('payload_hash', 64);
            $table->string('kind', 30);
            $table->decimal('amount', 15, 2);
            $table->string('currency', 3);
            $table->string('method', 30);
            $table->string('reference', 190)->nullable();
            $table->text('reason')->nullable();
            $table->foreignId('reversal_of')->nullable()->unique()->constrained('stay_payments')->restrictOnDelete();
            $table->unsignedInteger('actor_id')->nullable();
            $table->foreign('actor_id')->references('id')->on('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['booking_id', 'id']);
        });
        // Preserve the original advance/reference; represent it once in the new immutable ledger.
        DB::table('stay_bookings')->where('advance', '>', 0)->orderBy('id')->chunkById(200, function ($bookings) {
            foreach ($bookings as $booking) {
                DB::table('stay_payments')->insert([
                    'booking_id' => $booking->id, 'request_id' => $booking->request_id,
                    'payload_hash' => hash('sha256', 'opening:'.$booking->request_id),
                    'kind' => 'opening_advance', 'amount' => $booking->advance, 'currency' => $booking->currency,
                    'method' => 'unspecified', 'reference' => $booking->payment_reference, 'reason' => null,
                    'reversal_of' => null, 'actor_id' => $booking->created_by,
                    'created_at' => $booking->created_at, 'updated_at' => $booking->created_at,
                ]);
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stay_payments');
    }
};
