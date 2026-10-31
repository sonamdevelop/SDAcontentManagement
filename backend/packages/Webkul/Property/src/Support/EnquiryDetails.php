<?php

namespace Webkul\Property\Support;

class EnquiryDetails
{
    public static function normalize(array $data): array
    {
        return ['name' => trim($data['name']), 'email' => mb_strtolower(trim($data['email'])), 'phone' => isset($data['phone']) && trim($data['phone']) !== '' ? trim($data['phone']) : null, 'message' => trim(str_replace(["\r\n", "\r"], "\n", $data['message']))];
    }

    public static function fingerprint(int $id, array $details): string
    {
        return hash('sha256', json_encode([$id, self::normalize($details)], JSON_THROW_ON_ERROR));
    }
}
