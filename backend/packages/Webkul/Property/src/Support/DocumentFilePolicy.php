<?php

namespace Webkul\Property\Support;

class DocumentFilePolicy
{
    public const DISK = 'property_documents';

    public const MAX_KB = 10240;

    public const MAX_FILES = 50;

    public const CATEGORIES = ['registry', 'agreement', 'floor_plan', 'ownership_proof', 'other'];

    public const TYPES = ['application/pdf' => ['pdf'], 'image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png']];

    public static function detectedMime(string $path): string
    {
        return (new \finfo(FILEINFO_MIME_TYPE))->file($path) ?: 'application/octet-stream';
    }

    public static function allows(string $mime, string $name): bool
    {
        return in_array(strtolower(pathinfo(str_replace('\\', '/', $name), PATHINFO_EXTENSION)), self::TYPES[$mime] ?? [], true);
    }

    public static function downloadName(string $name, string $mime): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $stem = pathinfo($name, PATHINFO_FILENAME);
        $stem = preg_replace('/[\p{Cc}\p{Cf}<>:"|?*]/u', '_', $stem) ?? '';
        $stem = trim(mb_substr($stem, 0, 180), " .\t\r\n");

        return ($stem === '' ? 'document' : $stem).'.'.self::TYPES[$mime][0];
    }
}
