<?php

use Webkul\Property\Support\EnquiryDetails;
use Webkul\Property\Support\PropertyStatus;

it('enforces listing-purpose availability rules', function ($purpose, $status, $allowed) {
    expect(PropertyStatus::allows($purpose, $status))->toBe($allowed);
})->with([
    ['sale', 'available', true], ['sale', 'reserved', true], ['rent', 'reserved', true], ['sale', 'sold', true], ['sale', 'rented', false], ['sale', 'unavailable', true],
    ['rent', 'available', true], ['rent', 'rented', true], ['rent', 'sold', false], ['rent', 'unavailable', true], ['unknown', 'available', false], ['sale', 'unknown', false],
]);
it('normalizes enquiry details without changing message content', function () {
    expect(EnquiryDetails::normalize(['name' => ' Asha ', 'email' => ' ASHA@EXAMPLE.COM ', 'phone' => '', 'message' => " Hello\r\nWorld "]))
        ->toBe(['name' => 'Asha', 'email' => 'asha@example.com', 'phone' => null, 'message' => "Hello\nWorld"]);
});
it('fingerprints equivalent retries and separates properties and changed payloads', function () {
    $a = ['name' => 'Asha', 'email' => 'asha@example.com', 'phone' => null, 'message' => "Hello\nWorld"];
    $b = array_replace($a, ['email' => ' ASHA@EXAMPLE.COM ', 'message' => "Hello\r\nWorld "]);
    expect(EnquiryDetails::fingerprint(1, $a))->toBe(EnquiryDetails::fingerprint(1, $b))->not->toBe(EnquiryDetails::fingerprint(2, $a))->not->toBe(EnquiryDetails::fingerprint(1, array_replace($a, ['name' => 'Other'])));
});
