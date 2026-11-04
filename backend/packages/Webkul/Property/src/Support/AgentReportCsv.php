<?php

namespace Webkul\Property\Support;

class AgentReportCsv
{
    public const MAX_ROWS = 5000;

    public const LEADS = ['total', 'open', 'won', 'lost', 'unclassified'];

    public const VISITS = ['total', 'scheduled', 'completed', 'cancelled', 'no_show', 'upcoming'];

    public static function text(string $value): string
    {
        return preg_match('/^[\x00-\x20\x{FEFF}\x{00A0}]*[=+\-@]/u', $value) || preg_match('/^[\t\r\n]/', $value) ? "'".$value : $value;
    }

    public static function write($stream, array $rows, array $meta, array $sections): void
    {
        $headers = ['agent_id', 'agent_name', 'active', 'period_from', 'period_to', 'timezone', 'as_of'];
        $domains = [];
        if (in_array('leads', $sections, true)) {
            $domains['leads'] = self::LEADS;
        }
        if (in_array('site_visits', $sections, true)) {
            $domains['site_visits'] = self::VISITS;
        }
        foreach ($domains as $domain => $fields) {
            foreach ($fields as $field) {
                $headers[] = ($domain === 'site_visits' ? 'visits' : $domain).'_'.$field;
            }
        }
        fwrite($stream, "\xEF\xBB\xBF");
        fputcsv($stream, $headers, ',', '"', '', "\r\n");
        foreach ($rows as $row) {
            $cells = [$row['user_id'], self::text($row['name']), $row['active'] ? 'yes' : 'no', $meta['period']['from'] ?? '', $meta['period']['to'] ?? '', self::text($meta['period']['timezone']), $meta['as_of']];
            foreach ($domains as $domain => $fields) {
                foreach ($fields as $field) {
                    $cells[] = $row[$domain][$field];
                }
            }
            fputcsv($stream, $cells, ',', '"', '', "\r\n");
        }
    }
}
