<?php

use Webkul\Property\Repositories\PropertyFavouriteRepository;

it('redacts all current listing details when a saved property is no longer publicly visible', function () {
    $row = (object) ['id' => null, 'saved_property_id' => 7, 'saved_at' => '2026-11-04T10:00:00Z', 'title' => 'Unreviewed secret title', 'owner_phone' => 'Private phone', 'price' => '9999.00'];
    $view = (new PropertyFavouriteRepository)->view($row);
    expect($view)->toBe(['property_id' => 7, 'saved_at' => '2026-11-04T10:00:00+00:00', 'property' => null]);
    expect(json_encode($view))->not->toContain('Unreviewed', 'Private phone', '9999');
});
