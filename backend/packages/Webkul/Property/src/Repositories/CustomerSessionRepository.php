<?php

namespace Webkul\Property\Repositories;

class CustomerSessionRepository
{
    public function token($customer, int $id)
    {
        return $customer->tokens()->whereKey($id)->first();
    }

    public function activePage($customer, int $current, $asOf, ?int $minutes, int $perPage)
    {
        $q = $customer->tokens()->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', $asOf));
        if ($minutes) {
            $q->where('created_at', '>', $asOf->subMinutes($minutes));
        }

        return $q->select(['id', 'name', 'created_at', 'last_used_at', 'expires_at'])->orderByRaw('id = ? DESC', [$current])->orderByDesc('id')->paginate($perPage)->withQueryString();
    }

    public function revoke($customer, int $current, ?int $target): void
    {
        $q = $customer->tokens()->where('id', '!=', $current);
        if ($target !== null) {
            $q->whereKey($target);
        }
        $q->delete();
    }
}
