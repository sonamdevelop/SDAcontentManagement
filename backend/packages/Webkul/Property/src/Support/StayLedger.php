<?php

namespace Webkul\Property\Support;

class StayLedger
{
    public static function totals(iterable $entries, string $total, string $status): array
    {
        $rows = is_array($entries) ? $entries : iterator_to_array($entries);
        $reversed = [];
        foreach ($rows as $entry) {
            if ($entry['kind'] === 'reversal') {
                $reversed[(int) $entry['reversal_of']] = true;
            }
        }
        $received = 0;
        $refunded = 0;
        foreach ($rows as $entry) {
            if ($entry['kind'] === 'reversal' || isset($reversed[(int) $entry['id']])) {
                continue;
            }
            $amount = DealMoney::cents((string) $entry['amount']);
            if ($entry['kind'] === 'refund') {
                $refunded += $amount;
            } else {
                $received += $amount;
            }
        }
        if ($received > 999999999999999 || $refunded > 999999999999999 || $refunded > $received) {
            throw new \InvalidArgumentException('Invalid ledger totals.');
        }
        $net = $received - $refunded;
        $due = $status === 'cancelled' ? 0 : DealMoney::cents($total);

        return ['received_total' => StayDates::amount($received), 'refunded_total' => StayDates::amount($refunded), 'net_paid' => StayDates::amount($net), 'amount_due' => StayDates::amount($due), 'balance' => StayDates::amount(max(0, $due - $net)), 'refund_due' => StayDates::amount(max(0, $net - $due))];
    }
}
