<?php

namespace Webkul\Property\Support;

class StayStatement
{
    /** One complete snapshot, with internal metadata excluded from every row. */
    public static function make(array $booking, array $entries, string $generatedAt): array
    {
        $details = [];
        foreach (['id', 'room_type_id', 'stay_name', 'room_name', 'guest_name', 'timezone', 'check_in', 'check_out', 'rooms', 'guests', 'nightly_rate'] as $key) {
            $details[$key] = $booking[$key];
        }
        $reversed = [];
        foreach ($entries as $entry) {
            if ($entry['kind'] === 'reversal') {
                $reversed[(int) $entry['reversal_of']] = (int) $entry['id'];
            }
        }
        $rows = [];
        foreach ($entries as $entry) {
            $row = [];
            foreach (['id', 'kind', 'amount', 'method', 'created_at', 'reversal_of'] as $key) {
                $row[$key] = $entry[$key];
            }
            $row['reversed_by'] = $reversed[(int) $entry['id']] ?? null;
            $row['effective'] = $entry['kind'] !== 'reversal' && $row['reversed_by'] === null;
            $rows[] = $row;
        }
        $summary = StayLedger::totals($entries, $booking['total'], $booking['status']);
        foreach (['total', 'advance', 'currency', 'status'] as $key) {
            $summary[$key] = $booking[$key];
        }

        return ['generated_at' => $generatedAt, 'booking' => $details, 'summary' => $summary, 'entries' => $rows];
    }
}
