<?php

namespace Webkul\Property\Services;

use Illuminate\Support\Facades\DB;
use Webkul\Property\Repositories\CustomerRepository;
use Webkul\Property\Repositories\PropertyFavouriteRepository;
use Webkul\Property\Repositories\PropertyRepository;
use Webkul\User\Repositories\UserRepository;

class PropertyFavouriteService
{
    public function __construct(protected PropertyRepository $properties, protected PropertyFavouriteRepository $favourites, protected CustomerRepository $customers, protected UserRepository $users) {}

    public function save(int $customer, int $property): void
    {
        DB::transaction(function () use ($customer, $property) {
            $p = $this->properties->getModel()->newQuery()->lockForUpdate()->findOrFail($property);
            abort_unless($this->customers->locked($customer)->active, 403);
            if ($this->favourites->saved($customer, $property)) {
                return;
            }
            $this->users->getModel()->newQuery()->whereKey($p->user_id)->lockForUpdate()->firstOrFail();
            abort_unless($this->properties->publicQuery()->whereKey($property)->exists(), 404);
            $this->favourites->save($customer, $property);
        }, 3);
    }

    public function remove(int $customer, int $property): void
    {
        DB::transaction(function () use ($customer, $property) {
            abort_unless($this->customers->locked($customer)->active, 403);
            $this->favourites->remove($customer, $property);
        }, 3);
    }
}
