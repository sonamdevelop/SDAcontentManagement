<?php

use Webkul\Property\Support\DocumentFilePolicy;

it('requires an allowed content MIME and its matching filename extension', function ($mime, $name, $allowed) {
    expect(DocumentFilePolicy::allows($mime, $name))->toBe($allowed);
})->with([
    ['application/pdf', 'registry.PDF', true], ['image/jpeg', 'photo.jpeg', true], ['image/png', 'plan.png', true],
    ['application/pdf', 'registry.jpg', false], ['image/png', 'plan.pdf', false], ['text/html', 'contract.pdf', false],
    ['image/svg+xml', 'plan.svg', false], ['application/zip', 'contract.docx', false], ['application/pdf', 'registry.php', false],
    ['application/pdf', 'registry.pdf.php', false], ['application/pdf', 'no-extension', false],
]);

it('produces bounded download names without directory traversal or header controls', function ($name, $mime, $expected) {
    $safe = DocumentFilePolicy::downloadName($name, $mime);
    expect($safe)->toBe($expected)->and(mb_strlen($safe))->toBeLessThanOrEqual(200)
        ->and($safe)->not->toMatch('/[\\\\\/\x00-\x1f\x7f]/');
})->with([
    ['../../registry.pdf', 'application/pdf', 'registry.pdf'],
    ['C:\\private\\contract.PDF', 'application/pdf', 'contract.pdf'],
    ["agreement\r\nInjected.pdf", 'application/pdf', 'agreement__Injected.pdf'],
    ["plan\u{202e}gnp.png", 'image/png', 'plan_gnp.png'],
    [' .pdf', 'application/pdf', 'document.pdf'], ['scan.jpeg', 'image/jpeg', 'scan.jpg'],
    ['मालिकाना प्रमाण.pdf', 'application/pdf', 'मालिकाना प्रमाण.pdf'],
    [str_repeat('a', 400).'.pdf', 'application/pdf', str_repeat('a', 180).'.pdf'],
]);
