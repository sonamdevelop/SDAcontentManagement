<?php

use Webkul\Property\Support\StayLedger;

it('calculates effective receipts, refunds and outstanding balance with exact cents', function () {
    $rows = [['id' => 1, 'kind' => 'opening_advance', 'amount' => '100.01'], ['id' => 2, 'kind' => 'payment', 'amount' => '500.49'], ['id' => 3, 'kind' => 'refund', 'amount' => '25.25']];
    expect(StayLedger::totals($rows, '2000.50', 'confirmed'))->toMatchArray(['received_total' => '600.50', 'refunded_total' => '25.25', 'net_paid' => '575.25', 'balance' => '1425.25', 'refund_due' => '0.00']);
    expect(StayLedger::totals($rows, '2000.50', 'cancelled'))->toMatchArray(['amount_due' => '0.00', 'balance' => '0.00', 'refund_due' => '575.25']);
});
it('corrects original entries without erasing receipts or double-counting reversal amounts', function () {
    $rows = [['id' => 1, 'kind' => 'opening_advance', 'amount' => '100.01'], ['id' => 2, 'kind' => 'refund', 'amount' => '25.25'], ['id' => 3, 'kind' => 'reversal', 'amount' => '25.25', 'reversal_of' => 2]];
    expect(StayLedger::totals($rows, '2000.50', 'confirmed')['net_paid'])->toBe('100.01');
    $rows[] = ['id' => 4, 'kind' => 'reversal', 'amount' => '100.01', 'reversal_of' => 1];
    expect(StayLedger::totals($rows, '2000.50', 'confirmed')['net_paid'])->toBe('0.00');
});
it('rejects negative effective net payment and excessive gross amounts', function () {
    expect(fn () => StayLedger::totals([['id' => 1, 'kind' => 'refund', 'amount' => '1.00']], '1.00', 'confirmed'))->toThrow(InvalidArgumentException::class);
    expect(fn () => StayLedger::totals([['id' => 1, 'kind' => 'payment', 'amount' => '9999999999999.99'], ['id' => 2, 'kind' => 'payment', 'amount' => '0.01']], '1.00', 'confirmed'))->toThrow(InvalidArgumentException::class);
});
