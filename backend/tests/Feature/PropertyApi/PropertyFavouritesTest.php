<?php

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Webkul\Property\Models\Customer;

uses(DatabaseTransactions::class);
function favouriteCustomer()
{
    $c = Customer::create(['name' => 'Favourite customer', 'email' => Str::uuid().'@example.test', 'password' => Hash::make('CustomerPass123!'), 'active' => true]);

    return [$c, ['Authorization' => 'Bearer '.$c->createToken('favourites', ['customer:account', 'customer:favourites'])->plainTextToken]];
}
it('saves and removes only the customer membership idempotently without reordering or leaking private fields', function () {
    [$c,$h] = favouriteCustomer();
    $p = apiProperty(apiStaff([], all: true));
    $url = '/api/v1/customer/favourites/'.$p->id;
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.saved', false);
    $this->putJson($url, [], $h)->assertOk()->assertJsonPath('data.saved', true)->assertHeader('Cache-Control', 'no-store, private');
    $saved = DB::table('customer_property_favourites')->where('customer_id', $c->id)->first();
    $this->travel(10)->seconds();
    $this->putJson($url, [], $h)->assertOk();
    expect(DB::table('customer_property_favourites')->where('customer_id', $c->id)->count())->toBe(1)->and(DB::table('customer_property_favourites')->where('customer_id', $c->id)->value('created_at'))->toBe($saved->created_at);
    $list = $this->getJson('/api/v1/customer/favourites', $h)->assertOk()->assertJsonPath('data.0.property.id', $p->id)->assertJsonPath('meta.total', 1);
    expect($list->getContent())->not->toContain('owner_phone', 'owner_name', 'customer_id', 'moderation_reason', 'Private street');
    $this->deleteJson($url, [], $h)->assertNoContent();
    $this->deleteJson($url, [], $h)->assertNoContent();
    $this->getJson($url, $h)->assertOk()->assertJsonPath('data.saved', false);
});
it('returns unavailable placeholders without exposing edited rejected reserved or inactive listing data', function () {
    $this->withoutMiddleware(ThrottleRequests::class);
    [$c,$h] = favouriteCustomer();
    $u = apiStaff([], all: true);
    $p = apiProperty($u);
    $url = '/api/v1/customer/favourites/'.$p->id;
    $this->putJson($url, [], $h)->assertOk();
    foreach ([['is_published' => false], ['moderation_status' => 'pending'], ['moderation_status' => 'rejected'], ['status' => 'reserved']] as $change) {
        $p->forceFill(array_replace(['is_published' => true, 'moderation_status' => 'approved', 'status' => 'available', 'title' => 'Unreviewed private title'], $change))->save();
        $list = $this->getJson('/api/v1/customer/favourites', $h)->assertOk()->assertJsonPath('data.0.property', null)->assertJsonPath('data.0.property_id', $p->id);
        expect($list->getContent())->not->toContain('Unreviewed private title', 'price', 'photos');
        $this->putJson($url, [], $h)->assertOk();
    }
    $p->forceFill(['moderation_status' => 'approved', 'status' => 'available'])->save();
    $u->update(['status' => 0]);
    $this->getJson('/api/v1/customer/favourites', $h)->assertOk()->assertJsonPath('data.0.property', null);
    $this->deleteJson($url, [], $h)->assertNoContent();
    $this->putJson($url, [], $h)->assertNotFound();
});
it('requires independent customer identity active account and the favourite token ability', function () {
    [$c,$h] = favouriteCustomer();
    $u = apiStaff([], all: true);
    $p = apiProperty($u);
    $url = '/api/v1/customer/favourites/'.$p->id;
    $this->putJson($url, [])->assertUnauthorized();
    $this->putJson($url, [], apiHeaders($u, ['*']))->assertUnauthorized();
    $old = ['Authorization' => 'Bearer '.$c->createToken('old', ['customer:account', 'customer:bookings'])->plainTextToken];
    $this->putJson($url, [], $old)->assertForbidden();
    $this->getJson('/api/v1/customer/favourites', $old)->assertForbidden();
    $this->putJson($url, [], $h)->assertOk();
    [$other,$oh] = favouriteCustomer();
    $this->getJson($url, $oh)->assertOk()->assertJsonPath('data.saved', false);
    $this->getJson('/api/v1/customer/favourites', $oh)->assertOk()->assertJsonPath('meta.total', 0);
    $this->deleteJson($url, [], $oh)->assertNoContent();
    expect(DB::table('customer_property_favourites')->where('customer_id', $c->id)->count())->toBe(1);
    $c->update(['active' => false]);
    $this->getJson('/api/v1/customer/favourites', $h)->assertForbidden();
});
it('rejects new saves for nonpublic sources and ignores identity filters on the owned list', function () {
    [$c,$h] = favouriteCustomer();
    $u = apiStaff();
    $p = apiProperty($u);
    $p->forceFill(['moderation_status' => 'pending'])->save();
    $url = '/api/v1/customer/favourites/'.$p->id;
    $this->putJson($url, [], $h)->assertNotFound();
    $this->putJson($url, ['customer_id' => 999], $h)->assertUnprocessable();
    $this->putJson('/api/v1/customer/favourites/4294967294', [], $h)->assertNotFound();
    $this->getJson('/api/v1/customer/favourites?customer_id=999&per_page=1', $h)->assertOk()->assertJsonPath('meta.total', 0);
    $this->getJson('/api/v1/customer/favourites?per_page=51', $h)->assertUnprocessable();
    $this->deleteJson('/api/v1/customer/favourites/4294967294', [], $h)->assertNoContent();
});
it('ranks scoped popularity using active customer memberships without exposing customer identities', function () {
    $owner = apiStaff([], all: true, visibility: 'own');
    $p = apiProperty($owner);
    $p2 = apiProperty($owner);
    [$c,$h] = favouriteCustomer();
    [$c2,$h2] = favouriteCustomer();
    $this->putJson('/api/v1/customer/favourites/'.$p->id, [], $h)->assertOk();
    $this->putJson('/api/v1/customer/favourites/'.$p->id, [], $h2)->assertOk();
    $this->putJson('/api/v1/customer/favourites/'.$p2->id, [], $h)->assertOk();
    $sh = apiHeaders($owner, ['properties:read']);
    $list = $this->getJson('/api/v1/admin/property-favourites', $sh)->assertOk()->assertJsonPath('data.0.id', $p->id)->assertJsonPath('data.0.favourites_count', 2)->assertJsonPath('meta.total', 2);
    expect($list->getContent())->not->toContain($c->email, $c2->email, 'customer_id', 'owner_phone');
    $other = apiStaff(['properties'], visibility: 'own');
    $this->getJson('/api/v1/admin/property-favourites', apiHeaders($other, ['properties:read']))->assertOk()->assertJsonPath('meta.total', 0);
    $this->getJson('/api/v1/admin/property-favourites', $h)->assertUnauthorized();
    $this->getJson('/api/v1/admin/property-favourites', apiHeaders($owner, ['bookings:read']))->assertForbidden();
    $c2->update(['active' => false]);
    $this->getJson('/api/v1/admin/property-favourites?property_id='.$p->id, $sh)->assertOk()->assertJsonPath('data.0.favourites_count', 1);
    $this->getJson('/api/v1/admin/property-favourites?min_count=2', $sh)->assertOk()->assertJsonPath('meta.total', 0);
});
it('keeps stable owned pagination and removes memberships when their source property is deleted', function () {
    [$c,$h] = favouriteCustomer();
    $u = apiStaff([], all: true);
    $p = apiProperty($u);
    $p2 = apiProperty($u);
    $this->putJson('/api/v1/customer/favourites/'.$p->id, [], $h)->assertOk();
    $this->putJson('/api/v1/customer/favourites/'.$p2->id, [], $h)->assertOk();
    $this->getJson('/api/v1/customer/favourites?per_page=1', $h)->assertOk()->assertJsonPath('data.0.property_id', $p2->id)->assertJsonPath('meta.last_page', 2);
    $this->getJson('/api/v1/customer/favourites?page=2&per_page=1', $h)->assertOk()->assertJsonPath('data.0.property_id', $p->id);
    $this->deleteJson('/api/v1/admin/properties/'.$p->id, [], apiHeaders($u))->assertNoContent();
    $this->getJson('/api/v1/customer/favourites',$h)->assertOk()->assertJsonPath('meta.total',1);
});
it('rate limits save and remove attempts before adding a new membership',function () {
    [$c,$h] = favouriteCustomer();
    for ($i = 0; $i < 30; $i++) {
        $this->deleteJson('/api/v1/customer/favourites/999',[],$h)->assertNoContent();
    }$this->putJson('/api/v1/customer/favourites/999',[],$h)->assertTooManyRequests();
});
