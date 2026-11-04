<?php

namespace Webkul\Property\Repositories;

use Webkul\Core\Eloquent\Repository;
use Webkul\Property\Contracts\Customer;

class CustomerRepository extends Repository
{
    public function model()
    {
        return Customer::class;
    }

    public function byEmail(string $email)
    {
        return $this->model->newQuery()->where('email', $email)->lockForUpdate()->first();
    }

    public function locked(int $id)
    {
        return $this->model->newQuery()->lockForUpdate()->findOrFail($id);
    }
}
