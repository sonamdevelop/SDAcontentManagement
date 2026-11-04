<?php

use Webkul\Property\Support\CustomerActionLink;
use Webkul\Property\Support\CustomerEmailChange;

it('binds email-change hashes to the source email and separates them from reset/verify tokens', function () {
    $token = str_repeat('a', 64);
    expect(CustomerEmailChange::digest($token, 'OLD@example.test'))->toBe(CustomerEmailChange::digest($token, 'old@example.test'));
    expect(CustomerEmailChange::digest($token, 'old@example.test'))->not->toBe(CustomerEmailChange::digest($token, 'other@example.test'))->not->toBe(hash('sha256', $token));
    $url = CustomerActionLink::make('https://example.test', 'change-email', $token, 'new+tag@example.test', 7);
    parse_str(parse_url($url, PHP_URL_FRAGMENT), $data);
    expect(parse_url($url, PHP_URL_QUERY))->toBeNull();
    expect($data)->toBe(['email' => 'new+tag@example.test', 'token' => $token, 'customer_id' => '7']);
    expect(fn () => CustomerActionLink::make('https://example.test', 'change-email', $token, 'a@example.test'))->toThrow(InvalidArgumentException::class);
});
