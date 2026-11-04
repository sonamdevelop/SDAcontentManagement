# SDA public property website

A public React/TypeScript frontend for the Laravel APIs in `../backend`. It brings
Stay in Dandeli's selected branding assets and green/bronze design into the SDA
repository. The original repositories remain read-only and unchanged.

## Run locally

Requirements: Node 22.12+ and npm. Start the existing backend on port 8081 using
`backend/tools/start.sh` (or its first-time setup instructions), then:

```sh
cd web
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/properties`. By default Vite proxies `/api/v1` and
`/storage` to `http://127.0.0.1:8081`, so local browser requests use the same origin.
No staff login or browser token is needed for these public pages.

Optional values from `.env.example` can be copied to an ignored `.env.local`:

| Variable                  | Purpose                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| VITE_PROPERTY_API_URL     | Public API prefix, default `/api/v1`; use an absolute HTTPS API URL for a separate backend host |
| PROPERTY_API_PROXY_TARGET | Development proxy target only; default `http://127.0.0.1:8081`                                  |
| VITE_STAY_SITE_URL        | Existing stay/room website link; default `https://stayindandeli.in`                             |

Restart Vite after environment changes. Only public configuration belongs in
VITE\_\* variables: these values are embedded in the browser bundle. No staff
password, Laravel bearer token, Firebase config or database connection is needed.
For a separate browser/API origin, configure the backend's
PROPERTY_API_ALLOWED_ORIGINS with the frontend's exact scheme/host/port and clear
or rebuild Laravel's configuration cache. Use HTTPS for deployed sites.

## What is connected

- `/properties`: Laravel public catalogue, keyword/city/purpose/type/price filters,
  URL-backed filter state, pagination, loading/error/empty states and retry.
- `/properties/:id`: public detail, safe photo gallery, exact decimal price display,
  location limited to city/state, unavailable-property and closed-enquiry states.
- Public enquiry form: name/email/optional phone/message/explicit consent, backend
  field errors, pending/double-submit handling and a 202 acknowledgement.
- An uncertain enquiry retry reuses its UUID for the same normalized payload.
  Editing the payload starts a new submission. Details and retry state stay in
  component memory; they are not written to local/session storage.
- Catalogue requests and enquiry writes use credentials: omit and never send a
  staff Authorization header. Public views have no private/admin API fallback.

There are no fabricated listings in the running website. Actual Laravel records
must be published, available and assigned to an active agent. The property must
also accept enquiries for the form to appear. Empty databases show an empty state.
Create/publish records through the staff workspace or backend API/Postman kit.
Existing Firebase listings and room bookings are not automatically migrated.

SDA now has its own public stay catalogue at `/stays`; the reference website
remains separately labelled **Legacy stay website**. Its Laravel 11 backend was
not copied wholesale into the Laravel 12 CRM. SDA's staff inventory, booking and
finance workflows are implemented separately. Customer signup/login/profile and
owned booking reads, email verification/recovery and reviewed reservations are
available at `/account`. Firebase data/account migration and native mobile
integration remain pending.

## Source provenance and import boundary

[Source manifest](SOURCE_PROVENANCE.json) records both reference repository commit
IDs and SHA-256 hashes of the two copied website assets. It also identifies the
original Blade hero/header design references. Only those selected branding files
were imported; runtime code is self-contained in `web/`.

- `sonamdevelop/stayindandeliwithdashboard`: read-only Laravel/Blade website source.
- `sonamdevelop/buy-rent-sell-admin`: read-only React/Firebase Realtime Database
  admin-panel reference. It is not a mobile application source tree.

No source `.git` directories, environment files, SQL dumps, database contents,
uploaded customer documents or Firebase credentials were imported. The old
admin's localStorage `isAdmin` flag is not a Laravel authentication mechanism;
the staff UI uses Laravel authentication and server-side ACL/scope.
No commits or pushes are made to either reference repository.

## Tests and build

```sh
npm test
npm run build
npm run format:check
npx playwright install chromium
npm run test:browser
```

The unit/integration suite uses Vitest, Testing Library and MSW (no database).
Browser tests use controlled API fixtures and cover desktop/mobile URL filters,
refresh/back navigation, photos, unavailable/empty states, validation, consent,
anonymous requests and uncertain-write retry identity. Tests do not call either
reference repository's Firebase or booking services. Screenshots/traces are local
ignored artifacts under `test-results/`.

When a system Chromium is already available, use it instead of downloading:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

An additional real-browser check was performed against the Laravel backend using
its isolated `krayin_test` database: available/published records loaded, a private
draft stayed hidden, detail omitted the exact address, cross-origin preflight
worked, and an anonymous form created an enquiry plus its linked CRM lead. All
synthetic fixtures and the temporary test services were removed afterward.

## Deployment

`npm run build` creates `dist/`. Deploy it as a static SPA, with frontend routes
such as `/properties/12` falling back to `index.html`. Configure `/api/v1/*` to
reach the Laravel backend, or build with VITE_PROPERTY_API_URL pointing to its
HTTPS origin. If photos use relative `/storage` URLs, route those to Laravel's
public photo storage too. Keep private document storage separate and protected.

A generic static-host fallback is `try_files $uri $uri/ /index.html`; apply it to
the frontend location after API/storage routing, not over backend URLs. Vite's dev
server is local tooling, not a production web server. This change does not deploy
or modify the existing stayindandeli.in website.

## Staff workspace

Open `/staff` or use **Staff** in the public navigation. Sign in using a Laravel
staff account. The React workspace uses `/auth/login`, `/auth/me` and
`/auth/logout`; it does not use Firebase accounts or the CRM browser session.
Tokens live in tab-scoped sessionStorage (memory only when storage is blocked),
never localStorage. Signing out revokes the current token on Laravel. A failed
logout is shown as an error so the user can retry. Expired/rejected tokens clear
the session. Closing a tab is not server-side revocation; use Sign out on shared
computers. Deploy with HTTPS and restrict frontend script access as for any
bearer-token application.

Available screens:

- Overview: API counts, date filters, update timestamp and explicit unavailable
  sections when source permissions are missing.
- Properties: server-scoped paginated search/status filters; create/edit with
  exact decimal values, sale/rent fields, publication and enquiry switches.
- Photos: multipart uploads and removal of server-returned property paths.
  Full edits use POST with `_method=PUT`, allowing PHP to read uploaded files.
- Enquiries and leads: server-scoped paginated lists with permission-gated links
  to lead details and private contact information.
- Lead workflow: paginated eligible agent choices, stage changes inside the
  current pipeline, a required reason for lost leads, plain-text notes and
  dated follow-up tasks with rescheduling and pending/done actions.
- Follow-up queue: `/staff/follow-ups` with activity type, status, overdue filters
  and pagination.

Actions use exact permissions from `/auth/me`. Permissions are rechecked on tab
focus; Laravel remains authoritative for every request and token ability.
A reader needs `properties`; creation requires `properties.create`; editing
requires `properties` plus `properties.edit`. Enquiries require
`properties.enquiries`, leads require `leads`, and overview requires
`property-reports`. Tokens must also contain each corresponding API ability.
An all-permissions role bypasses action ACL only; backend visibility scope still
applies. Private contact/address data stays inside staff screens. Deal-controlled
reserved inventory remains governed by backend validation. There is no inventory
delete action in this phase.

New properties start unpublished with enquiries disabled. Save displays server
validation messages and retains the draft on failure. A successful save returns
to the property list. Staff property creation does not assign ownership from the
browser. User IDs come from the authenticated backend account.

Staff changes need no new migration. Use the existing API deployment, CORS
allowlist and `/storage` routing described above. SPA fallback must cover
`/staff/*`. Staff booking management is implemented in the later stay sections below; customer booking and mobile/account migration remain pending.

Validation for this phase includes unit/integration tests, desktop/mobile browser
checks, and a real browser against an isolated Laravel test database: login,
overview, property creation with exact decimal price and a photo, multipart
edit/publication, public private-field boundaries, photo removal, enquiry/lead
lists, mobile layout and server-side token revocation. Synthetic staff/property
fixtures and the temporary test services were removed after verification.

### Lead permissions and follow-ups

`leads.view` is required for a lead detail and its notes/tasks. Assignment also
requires `leads.assign`; the agent picker is paginated and only shows eligible
staff inside the backend visibility scope. Stage changes and activity writes
require `leads.edit`. Stage options additionally require `leads`, matching the
pipeline metadata API. The UI shows stages only from the lead's current pipeline;
cross-pipeline moves are not supported by the API. Laravel enforces both role
permissions and token abilities on every action.

Due times use the browser's displayed local timezone and are sent as explicit
ISO instants with seconds. The queue uses backend overdue status. Notes render as
plain text, including strings containing HTML. Existing task/note edit failures
retain the draft; the server may reject shared or inaccessible activities even
when a lead itself is visible. Follow-ups are in-app dated tasks, without email,
push or background notifications. Activity deletion is not included in this UI.

CRM values have up to four decimal places and are formatted without float
conversion, separately from two-decimal property prices. A real browser check
against isolated `krayin_test` verified scoped detail/contact access, an
out-of-scope 404, agent assignment, lost stage with reason, note creation/edit,
task creation/rescheduling/completion, mobile layout, overdue filters and logout.
The synthetic actors, leads, activities, pipeline and temporary test services
were removed afterward. No schema or backend API changes are required.

### Site visits

Open `/staff/site-visits` for a server-scoped list with status and start-time
range filters, pagination and detail/history links. The lead detail page links
to visits filtered to that lead. `/staff/site-visits/new` has paginated,
searchable property/lead choices and eligible agent choices. Only available
properties are offered; Laravel checks open leads with contacts and rejects
conflicting property, customer or agent slots. A failed save retains the draft.

Scheduling and rescheduling require a future start, positive duration up to eight
hours and explicit ISO timestamps. The browser displays its timezone and converts
local inputs to instants. Rescheduling requires a reason. Scheduled visits support
agent changes and cancellation with a reason. Completion requires feedback;
completed/no-show actions become selectable after the start time. Completed and
no-show visits allow feedback updates. Terminal visits cannot be reopened or
rescheduled through this UI. Visit history renders the API's events and changes
as plain text; saved property/customer names are snapshots. Agent/actor IDs are
shown where the existing API does not provide display names.

Permissions match the existing API:

- `visits` with `visits:read` for the list, `visits.view` for detail/history.
- `visits.create` plus `visits.view` with `visits:write` to schedule. The source
  pickers additionally require `properties`, `leads`, `leads.view` and the
  corresponding read abilities; this UI does not accept arbitrary source IDs.
- `visits.assign` plus `visits.view` to change agents.
- `visits.edit` plus `visits.view` to reschedule or change outcomes/feedback.

Agent choices require the write ability and create or assignment permission.
The backend still enforces visibility independently of role and token abilities,
including on source/agent choices and each mutation. No new migration is needed.
This phase does not add calendar sync or email/push notifications.

Unit/integration and desktop/mobile browser tests cover the visit workflows.
A real Laravel browser check against isolated `krayin_test` also verified India
timezone preservation, scheduling, overlap rejection with retained source choices,
an out-of-scope 404, rescheduling, agent changes, cancellation/history,
completion/no-show, feedback updates, filters, mobile layout and logout.
The synthetic property, leads, visits, agents and temporary services were removed
after verification.

### Private property documents

Open **Properties → Private documents**, or
`/staff/properties/{id}/documents`. Documents use the dedicated private API and
storage disk, separate from public photos. The page offers category filtering,
pagination, upload metadata, authenticated downloads and confirmed deletion.
PDF, JPEG and PNG files can be up to 10 MB each, with a backend-enforced limit of
50 files per property. The client checks size/type hints; Laravel validates the
actual content and extension. Upload failures retain the fields and selected file.
There is no automatic retry of upload POSTs, metadata editing or inline preview.

Permissions and token abilities:

- Parent `properties` access and its read ability are needed for the staff
  property context.
- `properties.documents` plus `documents:read` permits list/download.
- `properties.documents.create` plus `documents:write` permits upload. Upload-only
  staff see a success message without private list/download access.
- `properties.documents.delete` plus `documents:write` permits deletion after an
  explicit confirmation. The UI also needs list access to choose a document.

Downloads fetch a constructed API path with the staff Authorization header, never
put tokens in URLs or follow metadata-provided download URLs. After type/size
checks, the browser receives an attachment through a short-lived Blob URL.
Object URLs and in-flight downloads are cleaned up on navigation/logout. Private
staff requests bypass the browser cache; the API also serves document responses
with no-store headers. A download already saved by the user remains on that device.

A real browser check against isolated `krayin_test` verified invalid PDF rejection,
retained draft, valid multipart upload, metadata checksum, byte-exact authenticated
download, anonymous 401, out-of-scope 404, category filtering, mobile layout,
confirmed deletion followed by download 404, and logout token revocation. All
synthetic actors, properties, files and temporary services were removed afterward.
No schema/backend API changes are needed for this phase; existing private storage
and scheduled cleanup configuration still apply.

### Property deals

Open **Property deals** (`/staff/property-deals`) or **Reserve property** in the staff navigation. Property cards link to their filtered deal history. Lists support status, sale/rent purpose, property/lead/agent IDs, creation dates and pagination. Dates use the displayed browser timezone; filters persist in the URL. List-only users do not receive customer contact, notes, payment references or audit details.

Reserve an available property for an open lead with a customer. Enter the full negotiated agreed total and the recorded advance (included in that total), optional payment reference and internal notes. Monetary input stays as exact decimal strings, up to 13 integer digits and two decimal places. The advance cannot exceed the positive total. This records an offline advance; it does not collect money or verify a receipt. There is no additional advance/edit endpoint: correct a reservation by cancelling it and creating a new one.

An uncertain reservation response locks the draft and retries the identical payload with the same UUID. Do not start another reservation while resolving an uncertain save. The pending request stays in component memory only; navigating away or reloading loses it, so inspect existing deals before creating a replacement. Validation failures retain an editable draft.

The detail screen shows exact amounts, customer snapshots, reference, notes, timestamps, source lead link and chronological audit changes. Confirmation requires an explicit review: sale becomes sold, rental becomes rented, and confirmation is final. Cancellation requires a reason and releases an eligible hold, retaining its advance/reference and history; it does not initiate a refund. Neither action changes the lead stage. Final deals offer no reopen/edit actions. Refresh deal reloads current server state; uncertain transitions can retry the same action without changing the cancellation reason. Deleted source records retain readable snapshots/history.

Permissions mirror the API: `deals` lists, `deals.view` reads detail/history, and `deals.create`, `deals.confirm` or `deals.cancel` enables the corresponding action. Writes also require `properties` and `properties.edit`; reservation/confirmation need `leads.view`, and the reservation picker additionally needs `leads`. Cancellation does not require lead access. Laravel independently checks scope, source visibility and `deals:read`/`deals:write` plus source token abilities; log in again if an old token lacks them. Account permissions are rechecked on focus. Read access does not require source module rights.

Deal coverage includes exact high-value money, malformed data, UUID reuse on uncertain saves, rejected drafts, permission restrictions, URL filtering/pagination, terminal states, safe audit rendering and desktop/mobile reservation/confirmation/cancellation. Browser tests use controlled API fixtures; run the backend's isolated `tools/test-api.sh` for real MariaDB API integration and concurrent reservation checks.

For the real Laravel/MariaDB browser journey and staging requirements, see [acceptance and staging handoff](ACCEPTANCE.md).

### Staff stay bookings

**Stays and rooms** manages stays, timezone, room-type inventory/capacity and flat nightly rates. **Stay bookings** supports date-based availability, staff booking creation, offline advance/balance records, cancellation before check-in and history. See [stay booking rules and API](../backend/docs/STAYS.md). This does not migrate the original stay website or add public booking/payment collection.

Stay booking details now include reviewed **Record check-in/check-out** actions and local-time attendance history. List filters include not arrived, checked in and checked out. Early checkout preserves scheduled inventory and charges; it does not collect/refund money. See [attendance rules](../backend/docs/STAYS.md#guest-check-in-and-check-out).

### Stay payment ledger

Stay booking details now include offline payments/refunds, explicit review, exact net paid/outstanding/refund totals, immutable history and reasoned reversals. Original advance snapshots remain unchanged. See [payment rules and permissions](../backend/docs/PAYMENTS.md). This records offline events and never transfers money.

### Stay availability calendar

**Availability calendar** shows nightly room-type allocation/remaining capacity for a URL-backed date range of up to 62 nights. Refresh reflects cancellations. Inactive and past dates are not bookable, checkout dates are exclusive, and historical rows use current capacity. Guest/payment data is never included. See [calendar API](../backend/docs/STAYS.md#nightly-availability-calendar).

### Stay operations

**Stay operations** shows scheduled arrivals/departures for a selected stay/date, plus live in-house and overdue check-out queues. Filters survive URL reloads and pagination. Refresh reflects recorded attendance; open a booking for existing check-in/check-out actions. Requires stay access plus booking list/detail permissions. Guest contacts and payments are excluded from this dashboard. See [operations API and date semantics](../backend/docs/STAYS.md#staff-operations-dashboard).

### Stay payment follow-up

**Payment follow-up** lists outstanding collection and refund-due bookings by stay, with exact per-currency amounts, URL filters, pagination and refresh. Open booking detail for permitted ledger actions. Requires stay, booking list/detail and payment ledger access. See [queue rules and API](../backend/docs/PAYMENTS.md#stay-payment-follow-up).

**Stay bookings** also supports combined booking/stay IDs and inclusive arrival-date bounds, alongside room/status/attendance filters. URL filters survive reload and pagination; clearing restores the authorized list. See [booking finder semantics](../backend/docs/STAYS.md#booking-finder).

### Printable stay statement

Booking detail's ledger links to a print-friendly statement with complete chronological payment/correction history and exact balances. Refresh before printing to include recent changes. The browser print dialog supports printing or Save as PDF; staff navigation and controls are hidden. Requires booking-detail and ledger access. Internal notes/references/contacts are omitted. See [statement API and rules](../backend/docs/PAYMENTS.md#printable-booking-statement).

### Rich stay content and public catalogue

Use **Edit public stay content** on a staff stay card to edit stay/room descriptions, rules, amenities, gallery uploads/removals and publication. Both stay and room must be active/published to appear at `/stays` and `/stays/:id`. Anonymous catalogue requests never carry staff tokens. City/page filters persist in URLs; current nightly prices are not dated availability quotes. Customer dated quote/review/reservation is available from each room card. Apply the additive content migration; existing stays/rooms start unpublished. See [API, upload and publication rules](../backend/docs/STAYS.md#rich-stay-content-and-public-catalogue).

### Customer accounts and owned bookings

**My account** (`/account`) supports separate customer signup/login, profile and password changes. **My bookings** (`/account/bookings`) shows only explicitly linked customer-owned booking snapshots and exact balances. New accounts normally start empty; historical bookings are not automatically linked by email. Customer tokens are separate from staff tokens and public catalogue calls. Native clients and email-change verification remain pending. Apply the additive customer migration and see [account rules/API](../backend/docs/CUSTOMERS.md).

Customer dated reservations are now available from public stay room cards: sign in,
check availability, review and confirm, then read the owned booking. No online money
is collected. See [reservation rules](../backend/docs/RESERVATIONS.md).

Customer email verification and password recovery are implemented. New reservations require verified email; existing owned reads and exact request replay remain available. See [account recovery and mail configuration](../backend/docs/CUSTOMER_RECOVERY.md). Live SMTP delivery remains a deployment-time check.

Customer cancellation requests and staff approve/reject review are available, with complete history and no automatic refunds. See [cancellation rules](../backend/docs/CANCELLATIONS.md).

Property publication now requires moderation approval. Public content/photo edits require a fresh review; private edits and deal status retain approval. Staff use the scoped Property moderation queue with reasons, snapshots and safe revision retries. Existing published listings retain legacy approval. See [moderation rules](../backend/docs/MODERATION.md).

Customer saved properties and scoped staff popularity are available. Hidden/unreviewed listings show an unavailable placeholder without current private details. Older customer sessions must sign in again for customer:favourites. See [saved-property rules](../backend/docs/FAVOURITES.md).

Agent performance now has a dedicated web report with calendar timezone/date/agent filters, source-aware outcome bars and scoped all-filtered-agent CSV export. See [agent report rules](../backend/docs/AGENT_REPORTS.md).

Staff stay occupancy/cash reporting: `/staff/stay-reports`, with stay-local exclusive date ranges (1–62 nights), daily room meters and exact currency-separated values/corrections. See [semantics](../backend/docs/STAY_REPORTS.md).

The stay report screen exports the selected stay/date filters as a fresh CSV snapshot with currency-separated rows and no private customer/ledger fields.
