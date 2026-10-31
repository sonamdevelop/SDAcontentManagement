<?php

use Webkul\Property\Support\ApiOrigins;

it('normalizes exact HTTP origins including ports IPv6 and duplicates', function () {
    expect(ApiOrigins::parse(' https://WEB.example.com:443/,http://localhost:5173,http://127.0.0.1:80,https://web.example.com,http://[::1]:3000 '))
        ->toBe(['https://web.example.com', 'http://localhost:5173', 'http://127.0.0.1', 'http://[::1]:3000']);
});
it('fails closed for malformed wildcard opaque or non-origin entries', function ($input) {
    expect(ApiOrigins::parse($input))->toBe([]);
})->with(['', '*', 'https://*.example.com', 'null', 'ftp://web.example.com', 'https://user:secret@web.example.com', 'https://web.example.com/path', 'https://web.example.com?query=1', 'https://web.example.com#fragment', 'http://localhost:0', "https://web.example.com\r\nInjected: true"]);
it('does not widen a valid allowlist when invalid entries are mixed in', function () {
    expect(ApiOrigins::parse('*,https://web.example.com,https://evil.example/path'))->toBe(['https://web.example.com']);
});
