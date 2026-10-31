<?php

namespace Webkul\Property\Support;

class ApiOrigins
{
    /** Exact browser origins only; malformed entries and wildcards are ignored. */
    public static function parse(string $value): array
    {
        $origins = [];
        foreach (explode(',', $value) as $entry) {
            $entry = trim($entry);
            if (! filter_var($entry, FILTER_VALIDATE_URL) || preg_match('/[\x00-\x20]/', $entry)) {
                continue;
            }
            $parts = parse_url($entry);
            if (! in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || empty($parts['host'])
                || str_contains($parts['host'], '*') || isset($parts['user']) || isset($parts['pass'])
                || isset($parts['query']) || isset($parts['fragment']) || ! in_array($parts['path'] ?? '', ['', '/'], true)) {
                continue;
            }
            $scheme = strtolower($parts['scheme']);
            $port = $parts['port'] ?? null;
            if ($port !== null && ($port < 1 || $port > 65535)) {
                continue;
            }
            $suffix = $port === null || ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443) ? '' : ':'.$port;
            $origins[] = $scheme.'://'.strtolower($parts['host']).$suffix;
        }

        return array_values(array_unique($origins));
    }
}
