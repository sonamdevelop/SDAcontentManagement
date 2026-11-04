# Staff acceptance and staging handoff

Use the existing SDA checkout; both reference repositories remain read-only.

## Local verification

From `backend/`, run `bash tools/test-api.sh` against its isolated `krayin_test`
database. From `web/`, run `npm test`, `npm run build`, `npm run format:check`, and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser`.

The fixture-based browser suite is separate from the real service journey:

```sh
cd /workspace/SDAcontentManagement/backend
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium bash tools/test-browser-acceptance.sh
```

The acceptance runner requires the existing Compose database, installed backend
vendor dependencies, web node*modules, Chromium and free loopback ports 8082 and 5174. It creates uniquely named `sda_acceptance*_`and`sda*restore*_`databases;
it never refreshes, drops or resets a database. It verifies the selected database
before serving and uses the seeded local-only account in this new synthetic DB.
It removes only its own temporary API container on exit. Synthetic databases and
backup artifacts under ignored`backend/.runtime/acceptance/` are retained.

The real browser uses no mocked APIs. A second journey sets up a stay/room type, checks availability, books with exact totals and an advance, checks exhausted inventory, then cancels and verifies released availability. It logs in, publishes a property/photo,
checks public address privacy, submits an anonymous enquiry, opens the linked
lead, adds/completes follow-up work, schedules/cancels a visit, reserves with an
exact advance, cancels/re-reserves/confirms a deal and signs out. It checks that
reservation/confirmation hide the property publicly and cancellation restores it.
The runner then backs up/restores the synthetic database and compares key row
counts. It also copies the synthetic public/private uploads into backup and recovery
directories and verifies their SHA-256 checksums. This local exercise does not establish remote disaster recovery.

## Staging prerequisites

No staging provider, server, domain or deployment credentials have been configured.
Choose the hosting target before executing a remote deployment. The local Compose
file is a development setup with development credentials; do not expose it as a
public staging service.

Prepare a separate MariaDB database/user, PHP 8.3+ with the extensions required by
`composer.lock`, persistent public photo/private document storage, HTTPS API and
web hostnames, and a scheduler. Supply secrets in the hosting secret manager,
using `backend/environments/staging.env.example` as the non-secret template.
Use a fresh staging APP_KEY; retain it across releases and include it securely in
recovery procedures. Keep APP_DEBUG and Debugbar off. Do not copy development
.env files, local seeded passwords, customer records or reference Firebase data.

Install locked dependencies (`composer install --no-dev --prefer-dist
--no-interaction --optimize-autoloader`) using verified TLS and Composer's normal
integrity checks; never ignore platform requirements. Build `web/` with `npm ci`
and `npm run build`. Prefer same-origin HTTPS `/api/v1` and `/storage` routing;
otherwise set the public API build URL and the backend exact CORS origins.
Browser VITE variables must contain public configuration only.

Serve Laravel through a supported web server/PHP-FPM with its document root at
`backend/public`, route the SPA through `web/dist/index.html`, and preserve API
and photo routes before SPA fallback. Do not use artisan serve or Vite dev as
public staging servers. Apply ordinary forward migrations after a backup; never
run krayin-crm:install, migrate:fresh or db:wipe against existing staging data.
Use an approved initial staff provisioning process on an empty database and
replace all local defaults. Log in again for current token abilities. Run
`php artisan schedule:run` every minute for private-document cleanup retries.

Back up the database consistently and both public photos and private documents,
plus encryption-key/config references, before release. Verify a restore to a
separate recovery database/storage location. Never place private documents or
backups under the web root. Check file checksums and authenticated retrieval after
restore; a database dump alone does not recover uploaded files.

After deployment, run acceptance with synthetic staging accounts/data only:
verify administrator and restricted staff permissions, own/group visibility,
forbidden/out-of-scope responses, photos, private upload/download, anonymous
privacy, enquiry retry behavior, visit conflicts, deal cancel/confirm/history,
logout revocation, responsive layouts and browser console/network failures.
Verify HTTPS, CORS and no-store behavior from the actual browser origins. Retain
release and backup identifiers and prepare rollback of application artifacts;
do not roll back financial schema/data blindly.

A third real-service scenario records same-day guest check-in/check-out, checks persisted attendance history after reload, and verifies early departure preserves original charges and availability allocation.

A fourth real-service scenario exercises an opening advance, additional payment, partial refund, correction, cancellation and final refund. The synthetic backup/restore checks include stay_payments.

The real stay-booking journey also checks calendar rows before and after cancellation, verifying that nightly allocation changes without exposing guest/contact details.

The real same-day attendance scenario also verifies operations arrivals, in-house count after check-in, and removal from the live queue after check-out.

The real ledger journey also checks payment follow-up: initial collection, cancellation moving the booking to refund due, then a recorded final refund clearing the queue.

The real stay booking journey also finds its booking by ID and inclusive arrival date, rejects a later nonmatching bound and confirms guest identity is absent from the list.

The real ledger journey opens a printable statement after payment/refund/reversal/cancellation, checks all entries and settled totals, and verifies staff controls are hidden under print media.

A fifth real-service journey publishes stay/room text and photos, verifies a parent alone is hidden, opens the public catalogue/detail without staff credentials, checks an actual uploaded image loads, then unpublishes the stay and confirms public detail returns unavailable. Stay/room photos join the synthetic file backup/restore checksum checks.

A sixth real-service journey checks customer registration/profile, empty owned bookings, password revocation and logout while retaining a separately authenticated staff session. API fixtures separately verify positive owned reads and denial of foreign/unlinked matching-email bookings. Customer rows join synthetic DB restore-count checks.

The seventh real API journey creates/publishes a room, registers an independent
customer, quotes/reviews/confirms a zero-advance reservation, reloads owned detail,
checks inventory exhaustion and verifies customer actor history in the staff view.
All mutations use a unique synthetic acceptance database; native apps are unverified.

Customer reservation acceptance now first verifies its email using a local captured
message. An eighth real journey confirms verification, resets a forgotten password,
checks old-token rejection, signs in with the new password and rejects reused links.
The mail capture and database are unique per run; no live email delivery is used.

The real customer reservation journey now requests cancellation, receives a staff
rejection, sends a fresh request and receives approval. It checks customer-visible
responses, cancelled owned detail, zero outstanding amount and released inventory.
API tests separately verify paid bookings retain refund due without automatic refunds.

The property enquiry/deal journey now explicitly approves the created listing.
A ninth real journey rejects, resubmits and approves a property, edits its public
title, verifies public hiding and stale-decision rejection, and approves the fresh
revision before checking public detail. Backup/restore includes moderation audit rows.

A tenth real API journey creates/approves a listing, registers a customer, saves
it, checks staff popularity, edits public content into pending moderation, confirms
the saved card exposes no unreviewed title, removes it and checks refreshed counts.
Synthetic backup/restore includes customer_property_favourites rows.

An eleventh real API journey creates a property enquiry/lead and scheduled visit,
opens the agent report with UTC calendar filters and owner ID, reloads filters,
and downloads a CSV that includes aggregate metrics without private source contacts.
The normal isolated database/upload backup and restore checks still run afterward.

The real stay-report journey creates a stay/room and an advance-bearing booking, verifies future reserved value independently of today’s recorded cash, then confirms cancellation removes reserved nights/value without changing ledger events.

The stay-report real journey also downloads the actual CSV, verifies the stay/date-specific filename and exact booked amount, and checks private customer/hash data are absent. Mocked desktop/mobile journeys verify browser download behavior; integration tests cover MIME/filename rejection and retry.

The real customer-session journey creates three independent customer tokens, revokes one through the browser, checks its API access is 401 while another still works, then signs out all others. It verifies current customer/staff API access remains 200 and reload retains the current-device marker.

The real email-change journey requests a new address, reads its private link from isolated mail capture, verifies the old login remains active before explicit confirmation, then checks both old device tokens are revoked, staff access survives, the new verified login retains the same customer ID, and replay cannot change/revoke the fresh session.
