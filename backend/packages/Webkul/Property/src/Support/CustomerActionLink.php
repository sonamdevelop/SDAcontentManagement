<?php

namespace Webkul\Property\Support;

class CustomerActionLink
{
    public static function make(string $origin, string $purpose, string $token, string $email): string
    {
        $u = parse_url($origin);
        $local = in_array($u['host'] ?? '', ['localhost', '127.0.0.1', '[::1]'], true);
        if (! $u || ! isset($u['host']) || ! in_array($u['scheme'] ?? '', ['http', 'https'], true) || (($u['scheme'] ?? '') === 'http' && ! $local) || isset($u['user']) || isset($u['pass']) || isset($u['query']) || isset($u['fragment']) || ! in_array($u['path'] ?? '', ['', '/'], true) || ! in_array($purpose, ['verify', 'reset'], true) || ! preg_match('/^[a-f0-9]{64}$/D', $token)) {
            throw new \InvalidArgumentException('Invalid customer action origin or token.');
        }

        return rtrim($origin, '/').'/account/'.$purpose.'#'.http_build_query(['email' => $email, 'token' => $token], '', '&', PHP_QUERY_RFC3986);
    }
}
