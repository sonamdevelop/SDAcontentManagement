<?php

namespace Webkul\Property\Support;

class PropertyModeration
{
    public const FIELDS = ['title', 'description', 'purpose', 'property_type', 'price', 'rent_period', 'area', 'area_unit', 'bedrooms', 'bathrooms', 'city', 'state', 'images'];

    public static function content($property): array
    {
        $data = [];
        foreach (self::FIELDS as $key) {
            $data[$key] = $key === 'images' ? ($property->images ?? []) : $property->getAttribute($key);
        }

return $data;
    }

    public static function matches(string $status, int $revision, string $reason, array $data): bool
    {
        return $revision === $data['expected_revision'] && $status === $data['decision'] && $reason === trim($data['reason']);
    }
}
