<?php

use Webkul\Property\Support\StayContent;

it('retains ordered existing photos and counts replacements against the gallery limit', function () {
    expect(StayContent::remaining(['a', 'b', 'c'], ['b'], 8))->toBe(['a', 'c']);
    expect(StayContent::remaining(['a'], ['a'], 0))->toBe([]);
    expect(fn () => StayContent::remaining(array_fill(0, 10, 'a'), [], 1))->toThrow(InvalidArgumentException::class, 'image-limit');
});
it('rejects photo removal outside the target gallery', function () {
    expect(fn () => StayContent::remaining(['stay-content/stays/1/a.jpg'], ['../secret.jpg'], 0))->toThrow(InvalidArgumentException::class, 'invalid-image');
});
