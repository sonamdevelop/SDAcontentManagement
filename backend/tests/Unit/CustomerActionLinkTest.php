<?php

use Webkul\Property\Support\CustomerActionLink;

it('keeps email action secrets in a fragment on the configured frontend origin', function () {
    $url = CustomerActionLink::make('https://example.test', 'reset', str_repeat('a', 64), 'A+b@example.test');
    expect(parse_url($url, PHP_URL_PATH))->toBe('/account/reset')->and(parse_url($url, PHP_URL_QUERY))->toBeNull();
    parse_str(parse_url($url, PHP_URL_FRAGMENT), $values);
    expect($values)->toBe(['email' => 'A+b@example.test', 'token' => str_repeat('a', 64)]);
});
it('rejects insecure remote origins and injected paths or credentials', function (string $origin) {
    expect(fn () => CustomerActionLink::make($origin, 'verify', str_repeat('b', 64), 'a@example.test'))->toThrow(InvalidArgumentException::class);
})->with(['http://example.test', 'https://evil@example.test', 'https://example.test/redirect', 'https://example.test?next=x', 'https://example.test#x', 'javascript:alert(1)', '//example.test']);
