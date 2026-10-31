<?php

namespace Webkul\Property\Console\Commands;

use Illuminate\Console\Command;
use Webkul\Property\Repositories\PropertyDocumentRepository;

class CleanupPropertyDocuments extends Command
{
    protected $signature = 'property-documents:cleanup';

    protected $description = 'Retry removal of private files for deleted property documents';

    public function handle(PropertyDocumentRepository $documents): int
    {
        $purged = 0;
        $pending = 0;
        $documents->getModel()->newQuery()->onlyTrashed()->select('id')->chunkById(100, function ($rows) use ($documents, &$purged, &$pending) {
            foreach ($rows as $row) {
                $documents->purgeDeleted($row->id) ? $purged++ : $pending++;
            }
        });
        $this->info("Purged {$purged} document(s); {$pending} pending.");

        return $pending === 0 ? self::SUCCESS : self::FAILURE;
    }
}
