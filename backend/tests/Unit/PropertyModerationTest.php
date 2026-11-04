<?php

use Webkul\Property\Models\Property;
use Webkul\Property\Support\PropertyModeration;

it('normalizes cast public content and excludes private details publication switches and deal status', function () {
    $a = new Property(['title' => 'Home', 'price' => '100', 'area' => '1200', 'owner_name' => 'Private owner', 'images' => null]);
    $b = new Property(['title' => 'Home', 'price' => '100.00', 'area' => '1200.00', 'owner_name' => 'Changed', 'status' => 'reserved', 'is_published' => true, 'images' => []]);
    expect(PropertyModeration::content($a))->toBe(PropertyModeration::content($b));
    $b->title = 'Edited';
    expect(PropertyModeration::content($a))->not->toBe(PropertyModeration::content($b));
});
it('recognizes only exact decisions on the reviewed content revision', function () {
    $d = ['expected_revision' => 2, 'decision' => 'approved', 'reason' => ' Reviewed '];
    expect(PropertyModeration::matches('approved', 2, 'Reviewed', $d))->toBeTrue();
    expect(PropertyModeration::matches('approved', 3, 'Reviewed', $d))->toBeFalse();
    expect(PropertyModeration::matches('rejected', 2, 'Reviewed', $d))->toBeFalse();
});
