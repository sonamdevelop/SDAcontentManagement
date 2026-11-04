<?php

use Webkul\Property\Support\CustomerIdentity;

it('normalizes customer email consistently without interpreting it as booking ownership', function () {
    expect(CustomerIdentity::email('  Guest+Trips@Example.TEST  '))->toBe('guest+trips@example.test');
    expect(CustomerIdentity::email('guest+trips@example.test'))->toBe('guest+trips@example.test');
});
