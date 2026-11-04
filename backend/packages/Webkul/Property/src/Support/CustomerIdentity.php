<?php

namespace Webkul\Property\Support;

class CustomerIdentity
{
    public static function email(string $value): string
    {
        return mb_strtolower(trim($value));
    }
}
