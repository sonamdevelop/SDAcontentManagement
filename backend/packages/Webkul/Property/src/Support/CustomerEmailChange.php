<?php

namespace Webkul\Property\Support;

class CustomerEmailChange
{
    public const PURPOSE = 'change-email';

    public static function digest(string $token, string $currentEmail): string
    {
        return hash('sha256', self::PURPOSE."\0".$token."\0".CustomerIdentity::email($currentEmail));
    }
}
