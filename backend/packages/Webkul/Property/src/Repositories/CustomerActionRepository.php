<?php

namespace Webkul\Property\Repositories;

use Illuminate\Support\Facades\DB;

class CustomerActionRepository
{
    public function locked(int $id, string $purpose)
    {
        return DB::table('stay_customer_actions')->where('customer_id', $id)->where('purpose', $purpose)->lockForUpdate()->first();
    }

    public function issue(int $id, string $email, string $purpose, string $hash): void
    {
        DB::table('stay_customer_actions')->updateOrInsert(['customer_id' => $id, 'purpose' => $purpose], ['email' => $email, 'token_hash' => $hash, 'expires_at' => now()->addMinutes(60), 'consumed_at' => null, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function consume(int $id, ?string $purpose = null): void
    {
        $q = DB::table('stay_customer_actions')->where('customer_id', $id)->whereNull('consumed_at');
        if ($purpose !== null) {
            $q->where('purpose', $purpose);
        }
        $q->update(['consumed_at' => now(), 'updated_at' => now()]);
    }
}
