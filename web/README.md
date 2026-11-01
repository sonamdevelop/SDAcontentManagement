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

The existing stay/booking website remains reachable through **Explore stays**.
Its Laravel 11 room/booking backend was not copied into the Laravel 12 CRM. The
SDA staff workspace covers property/lead management and site visits. Firebase
account/data migration, customer authentication and mobile wiring are later work.

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
`/staff/*`. Deals, booking management and mobile migration
remain future UI phases; their existing backend APIs are unchanged.

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
