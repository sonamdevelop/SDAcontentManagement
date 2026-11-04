<?php

namespace Webkul\Property\Repositories;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Webkul\Property\Http\Resources\PublicPropertyResource;

class PropertyFavouriteRepository
{
    public function query()
    {
        return DB::table('customer_property_favourites');
    }

    public function saved(int $customer, int $property): bool
    {
        return $this->query()->where('customer_id', $customer)->where('property_id', $property)->exists();
    }

    public function save(int $customer, int $property): void
    {
        $this->query()->insert(['customer_id' => $customer, 'property_id' => $property, 'created_at' => now()]);
    }

    public function remove(int $customer, int $property): void
    {
        $this->query()->where('customer_id', $customer)->where('property_id', $property)->delete();
    }

    public function listing(int $customer, int $perPage)
    {
        $properties = app(PropertyRepository::class);

        return $properties->getModel()->newQuery()->from('customer_property_favourites as favourites')->leftJoinSub($properties->publicQuery()->select('properties.*'), 'visible', fn ($j) => $j->on('visible.id', '=', 'favourites.property_id'))->where('favourites.customer_id', $customer)->select(['visible.*', 'favourites.property_id as saved_property_id', 'favourites.created_at as saved_at'])->orderByDesc('favourites.id')->paginate($perPage);
    }

    public function view($row): array
    {
        return ['property_id' => (int) $row->saved_property_id, 'saved_at' => Carbon::parse($row->saved_at)->toIso8601String(), 'property' => $row->id === null ? null : (new PublicPropertyResource($row))->resolve()];
    }

    public function popularity(array $filters)
    {
        $counts = $this->query()->join('stay_customers', 'stay_customers.id', '=', 'customer_property_favourites.customer_id')->where('stay_customers.active', true)->select('property_id')->selectRaw('COUNT(*) as favourites_count')->groupBy('property_id');
        $q = app(PropertyRepository::class)->getModel()->newQuery()->joinSub($counts, 'saved', fn ($j) => $j->on('saved.property_id', '=', 'properties.id'));
        $ids = bouncer()->getAuthorizedUserIds();
        if ($ids !== null) {
            $q->whereIn('properties.user_id', $ids);
        }if (isset($filters['property_id'])) {
            $q->where('properties.id', $filters['property_id']);
        }

        return $q->where('saved.favourites_count', '>=', $filters['min_count'] ?? 1)->select(['properties.id', 'title', 'city', 'status', 'moderation_status', 'is_published', 'saved.favourites_count'])->orderByDesc('saved.favourites_count')->orderByDesc('properties.id')->paginate($filters['per_page'] ?? 20);
    }
}
