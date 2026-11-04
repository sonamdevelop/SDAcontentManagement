<?php

use Webkul\Property\Support\StayCancellation;

it('permits requests only before the local arrival date on confirmed unarrived bookings', function () {
    expect(StayCancellation::eligible('confirmed', false, '2026-11-06', '2026-11-05'))->toBeTrue();
    foreach ([['cancelled', false, '2026-11-06'], ['confirmed', true, '2026-11-06'], ['confirmed', false, '2026-11-05'], ['confirmed', false, '2026-11-04']] as [$status,$arrived,$arrival]) {
        expect(StayCancellation::eligible($status, $arrived, $arrival, '2026-11-05'))->toBeFalse();
    }
});
