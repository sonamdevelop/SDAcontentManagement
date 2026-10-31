# Property backend API v1

API prefix: `/api/v1`. Send `Accept: application/json`. JSON bodies use
`Content-Type: application/json`. The versioned API is stateless, including when
an Origin/Referer header is present. Staff requests use Sanctum personal access
tokens; web sessions are not accepted. No web/mobile frontend has been connected.

For Postman imports, local/staging configuration and client wiring, see
[INTEGRATION.md](INTEGRATION.md). Cross-origin browser access to `/api/v1` uses
PROPERTY_API_ALLOWED_ORIGINS (exact comma-separated origins, empty by default);
it does not enable cookie/session authentication.

## Endpoints

| Method | Path (after `/api/v1`) | Access |
|---|---|---|
| POST | `/auth/login` | Email, password, device_name; 5 attempts/IP/minute |
| GET | `/auth/me` | Active bearer token |
| POST | `/auth/logout` | Revokes current bearer token only |
| GET | `/properties` | Public, published/available properties from active agents |
| GET | `/properties/{id}` | Public, same visibility restrictions |
| POST | `/properties/{id}/enquiries` | Public, published property with enquiries enabled |
| GET | `/admin/properties` | `properties` role permission + `properties:read` token ability |
| GET | `/admin/properties/{id}` | Same, with record visibility |
| POST | `/admin/properties` | `properties.create` + `properties:write` |
| PUT | `/admin/properties/{id}` | `properties.edit` + `properties:write`; full replacement fields |
| DELETE | `/admin/properties/{id}` | `properties.delete` + `properties:write` |
| GET | `/admin/enquiries` | `properties.enquiries` + `enquiries:read` |

Role permission type `all` is respected. Token abilities never override role
permissions or own/group/global record visibility. User status, role permissions,
token expiration and revocation are rechecked on every authenticated request.
Tokens expire after 30 days; login creates a separate token for each client.
There is no public staff-registration or role-escalation endpoint.

## Login and property creation

Login returns HTTP 201 with `data.access_token`, `data.token_type` (Bearer), and
`data.expires_at`. Keep the token in secure client storage and send:
`Authorization: Bearer <access_token>`. It is returned only at creation, stored
hashed in the database, and excluded from profile responses. Login errors use the
same message for wrong passwords, missing accounts and disabled users.

Example property body (POST, or complete PUT):

```json
{
  "title": "River view apartment",
  "purpose": "sale",
  "property_type": "apartment",
  "price": "6500000.50",
  "area": "1200",
  "area_unit": "sqft",
  "bedrooms": 2,
  "bathrooms": 2,
  "address": "Private street 12",
  "city": "Dandeli",
  "state": "Karnataka",
  "owner_name": "Example owner",
  "owner_phone": "+91 9000000000",
  "status": "available",
  "is_published": false,
  "accepts_enquiries": false
}
```

Supported types: apartment, house, villa, plot, commercial. Purpose: sale/rent.
Rent requires `rent_period` daily/monthly/yearly; sale clears it. Area units:
sqft/sqm/acre. Status: available/reserved/sold/rented/unavailable; reserved is controlled by deals.
Sold applies only to sale,
rented only to rent. Description and postal_code are optional. Price is nonnegative
with at most two decimals; area must be positive. Decimal values return as strings
and use the configured application currency. Creator/agent IDs are assigned by
the server; callers cannot overwrite assignment or raw stored image paths.

New properties default to unpublished and enquiries disabled. Publication and
enquiry acceptance are separate opt-ins. Only published, available properties
assigned to active staff appear publicly. Exact address, owner contact, staff ID,
image storage paths, and other internal fields are omitted from public resources.
Property photos are public assets; do not upload confidential documents as photos.

## Photos and filters

Submit `multipart/form-data` with `photos[]` for uploads. Ten JPEG/PNG/WebP photos,
5 MB each, are allowed in total per property. On edits use the PHP-compatible
POST method override `_method=PUT` at `/admin/properties/{id}` to upload files.
`remove_images[]` accepts only image_paths already returned by that property's
admin response. Photo removal happens after database commit; failed writes remove
newly uploaded files. Configure PHP/web-server request limits for ten photos
(the supplied Docker PHP configuration permits 64 MB multipart requests).

Catalogue/admin filters: `q`, `city`, `purpose`, `property_type`, `min_price`,
`max_price`, `page`, `per_page` (1–100, default 15). Admin also accepts all statuses;
public status may only be available. `q` searches title/city. Collections return
`data`, `links`, `meta`; single records return `data`.
Enquiry history supports `property_id`, `page`, `per_page` (default 20, maximum 100).

## Customer enquiries

```json
{
  "submission_id": "a9164be8-c719-4679-b62f-4b52845f00a1",
  "name": "Asha Rao",
  "email": "asha@example.com",
  "phone": "+91 9000000000",
  "message": "Please arrange a site visit.",
  "consent": true
}
```

Generate a UUID per form submission and retain it across retries. The same UUID,
property and normalized details return the same generic HTTP 202 acknowledgement
without creating duplicate enquiries, contacts, leads or notifications. Changed
details with the same UUID/property return 422. A fresh UUID creates a fresh
enquiry. This is retry idempotency, not email-based spam deduplication. Submissions
are limited to five attempts/IP/minute, including retries and invalid requests.
All API routes have a broader 120 requests/IP/minute limit.

A contact and CRM lead are created transactionally and assigned to the property's
agent. Existing contacts are reused by exact normalized email only within that
agent's scope, without overwriting contact details. The lead starts in the default
pipeline's first open stage. Initial lead value is zero for later qualification,
avoiding overflow from larger property prices. Its title carries the property ID.
The existing CRM in-app notification is used; this does not configure email or
WhatsApp messaging. Submitted lead, agent, contact, pipeline and email IDs are
ignored. Enquiry acknowledgement never exposes internal IDs or contact existence.

Enquiry history preserves property-title/customer snapshots when properties or
leads are removed. Idempotency UUIDs/hashes are excluded from admin responses.
Unsupported template expressions are rejected before reaching CRM views.

## Responses and operational notes

- 200 read/update; 201 token/property creation; 202 enquiry accepted; 204 delete/logout.
- 401 missing/invalid/expired bearer token or invalid login; 403 insufficient
  permission/ability or disabled account; 404 missing/inaccessible property.
- 422 validation: `message` and `errors` keyed by field; 429 rate limit;
  503 when enquiries cannot be routed because no open pipeline stage exists.

Use HTTPS in deployment, set APP_DEBUG=false and configure APP_URL, persistent
storage, database credentials, rate-limit cache and CORS before connecting real
clients. Replace local example admin/database credentials before deployment.
Firebase data migration, customer account authentication and room/stay booking APIs remain
outside this backend API scope.

Machine-readable contract: [openapi.json](openapi.json).

## Lead management and follow-ups

New logins also receive `leads:read` and `leads:write` token abilities. Existing
property-only tokens remain valid for their original endpoints; log in again to
obtain lead abilities. Abilities never override current role permissions or record
visibility. These endpoints require an active bearer token:

| Method | Path (after `/api/v1/admin`) | Role permission / ability |
|---|---|---|
| GET | `/leads` | `leads` / `leads:read` |
| GET | `/leads/{id}` | `leads.view` / `leads:read` |
| GET | `/lead-pipelines` | `leads` / `leads:read` |
| GET | `/lead-assignees` | `leads.assign` **and** `leads.view` / `leads:write` |
| PATCH | `/leads/{id}/assignment` | `leads.assign` **and** `leads.view` / `leads:write` |
| PATCH | `/leads/{id}/stage` | `leads.edit` **and** `leads.view` / `leads:write` |
| GET | `/follow-ups` | `leads.view` / `leads:read` |
| GET | `/leads/{id}/follow-ups` | `leads.view` / `leads:read` |
| POST | `/leads/{id}/follow-ups` | `leads.edit` **and** `leads.view` / `leads:write` |
| PATCH | `/leads/{id}/follow-ups/{activityId}` | `leads.edit` **and** `leads.view` / `leads:write` |
| DELETE | `/leads/{id}/follow-ups/{activityId}` | `leads.edit` **and** `leads.view` / `leads:write` |

The `all` role still bypasses action restrictions, while record scope always
applies. A group user with no groups sees no records; empty scope never means
unrestricted access. Inaccessible lead/activity IDs return 404. Lead summaries
exclude private customer contact details, descriptions and lost reasons; those
are available only through authorized detail/mutation responses.

Lead filters: `q` (title search), `lead_pipeline_id`, `lead_pipeline_stage_id`,
`user_id`, `property_id` (via enquiry linkage), `page`, `per_page` (1–100). Pipeline
metadata returns names, IDs and stages; eligible assignees return paginated IDs
and names only. Assignees must be active, able to view leads, and inside the
caller's data scope (global/group/individual). Assignment cannot change the
recipient's role or data scope. It does not transfer shared customer contacts,
properties or enquiry-history ownership. Exclusive task ownership transfers with
the lead so the receiving agent can manage the work.

Assignment body:

```json
{"user_id": 7}
```

Stage update body:

```json
{"lead_pipeline_stage_id": 4, "lost_reason": "Budget does not match"}
```

A stage must belong to the lead's current pipeline; this API does not switch
pipelines. A lost stage requires a reason. Won/lost close the lead; a repeated
terminal update preserves its closure timestamp. Reopening clears closed_at and
lost_reason. Existing expected-close dates, customer identity and product rows
remain intact. Caller-supplied product arrays, pipeline IDs, contact IDs and other
unrelated fields are ignored by these partial-update endpoints.

Create a note:

```json
{"type": "note", "comment": "Buyer prefers a river-facing property."}
```

Create a follow-up task:

```json
{
  "type": "task",
  "title": "Call buyer",
  "comment": "Discuss available properties",
  "due_at": "2026-11-02T10:30:00+05:30"
}
```

Task title and due_at are required; note comment is required. Notes are completed
history entries, not pending tasks. Tasks default to pending; optional `is_done`
allows historical completed tasks. PATCH accepts title, non-empty comment,
due_at and is_done; type and lead linkage are immutable. Toggle task status using
`{"is_done": true}` or `{"is_done": false}`. Pending tasks are overdue strictly
after their due timestamp. Past due dates are allowed for historical/overdue work.

Dates require seconds and an explicit timezone (`Z` or `+05:30`, for example).
They are stored using the configured application timezone and returned as ISO
8601 timestamps with offset. Notes/tasks reuse the CRM activities and
lead_activities tables; no parallel task database or schema migration is needed.
API comments are plain text, encoded safely for the existing CRM timeline and
returned as plain text. Template expressions are rejected. Client-supplied
participants, files, ownership and extra relation IDs are ignored. Task/calendar
editing through a new frontend is not part of this backend phase.

Follow-up filters: `type=note|task`, `status=pending|done`, `overdue=0|1`,
`due_after`, `due_before`, `page`, `per_page` (1–100). Sorting is by earliest due
first, notes without due dates last. Aggregate `/follow-ups` covers only visible
leads. Activity lead_ids are restricted to visible leads, including shared
activities. System/email records are excluded. Shared activities cannot be
updated/deleted through these endpoints. Notes also require author visibility for
mutation; tasks are managed by current lead visibility so reassigned work remains
usable. These endpoints do not send external reminder emails/SMS/WhatsApp.

## Site visits

New login tokens include `visits:read` and `visits:write`; existing tokens keep
their old abilities. Log in again to obtain visit abilities. No public site-visit
endpoint is exposed. All routes below are under `/api/v1/admin`:

| Method | Path | Role permission / token ability |
|---|---|---|
| GET | `/site-visits` | `visits` / `visits:read` |
| GET | `/site-visits/{id}` | `visits.view` / `visits:read` |
| POST | `/site-visits` | `visits.create` + `visits.view` / `visits:write` |
| GET | `/site-visit-agents` | `visits.view` and either `visits.create` or `visits.assign` / `visits:write` |
| PATCH | `/site-visits/{id}/schedule` | `visits.edit` + `visits.view` / `visits:write` |
| PATCH | `/site-visits/{id}/assignment` | `visits.assign` + `visits.view` / `visits:write` |
| PATCH | `/site-visits/{id}/status` | `visits.edit` + `visits.view` / `visits:write` |
| PATCH | `/site-visits/{id}/feedback` | `visits.edit` + `visits.view` / `visits:write` |

Create a visit:

```json
{
  "property_id": 12,
  "lead_id": 25,
  "user_id": 7,
  "starts_at": "2026-11-03T10:00:00+05:30",
  "ends_at": "2026-11-03T11:00:00+05:30",
  "notes": "Meet at reception"
}
```

The scheduler additionally needs `properties` and `leads.view` permissions and
must have visibility of both source records. Properties must be available (they
need not be published). Leads must be open and linked to a customer contact.
Customer name/email/phone and property title/city are derived by the server and
snapshotted; caller-supplied customer, creator, status or audit fields are ignored.
A lead may visit another available property; it is not restricted to the property
from its original enquiry. Customer/lead/property identity cannot be changed on
an existing visit. Create a new visit when the lead's customer has changed.

Assigned agents must be active, have `visits.view` or an `all` role, and be within
the scheduler's/assigner's current user scope. Visit list/detail visibility uses
the assigned agent's ID and the existing individual/group/global rules. Assignment
intentionally grants that agent access to the visit's customer snapshots; it does
not transfer or grant independent access to the underlying lead/property. List
summaries omit customer email/phone, private notes, feedback and event history;
detail/mutation responses require `visits.view` and include those fields.

Starts and ends require ISO 8601 seconds plus an explicit timezone. Start must be
in the future, end after start, and duration at most eight hours. Adjacent slots
are allowed. Overlap with any **scheduled site visit** for the same agent,
property or customer is rejected with 422 (`errors.starts_at`), without exposing
who booked it. Shared resources are locked, conflict queries use current locking
reads and root transactions retry concurrency failures. A two-process MariaDB
integration test verifies one booking commits and the conflicting request fails,
even when both workers started with older database snapshots.

This module checks its own site-visit schedule. It does not sync with native CRM
activity appointments, external calendars, travel buffers or room/stay bookings.
No external reminder messages are sent. Those integrations remain future work.

Reschedule a scheduled visit using both timestamps plus a mandatory reason:

```json
{
  "starts_at": "2026-11-03T12:00:00+05:30",
  "ends_at": "2026-11-03T13:00:00+05:30",
  "reason": "Customer requested a later slot"
}
```

Reassignment uses `{"user_id": 8}` and checks availability for the new agent.
Completed/cancelled/no-show visits cannot be rescheduled or reassigned. Repeating
an identical schedule or agent assignment does not add another event/counter.
A duplicate create for the same busy slot is rejected rather than creating a
second visit; creation does not use the enquiry form's submission UUID.

Status values and rules:

- `scheduled` → `completed`: only at/after the start; non-empty feedback required.
- `scheduled` → `no_show`: only at/after the start; feedback optional.
- `scheduled` → `cancelled`: cancellation_reason required; allowed before start.
- Terminal states cannot be reopened or changed to another terminal state.
- Repeating the current status is idempotent: terminal timestamps, feedback and
  cancellation reason are preserved; no new event is added.

Examples:

```json
{"status": "completed", "feedback": "Buyer is interested; send a quotation."}
```

```json
{"status": "cancelled", "cancellation_reason": "Customer unavailable"}
```

PATCH `/feedback` accepts `{"feedback": "Updated visit outcome"}` only after
completion/no-show. Identical feedback retries do not add an event. There is no
hard-delete API: keep history and cancel instead. Audit entries record actor,
action, timestamps and schedule/agent/status changes; feedback revisions retain
old/new feedback. Property/lead/contact deletion clears live foreign references
but preserves the visit snapshots and history. Such visits can still be read and
cancelled; source-dependent scheduling/assignment is blocked.

List filters: `status`, `property_id`, `lead_id`, `user_id`, `from`, `to`, `page`,
`per_page` (1–100, default 20). `from`/`to` bound the visit's start instant and
require explicit timezones. Results sort by start time, then ID. Agent options are
paginated IDs/names only. All validation failures return the standard 422 shape;
unauthenticated 401, insufficient permission/ability 403, inaccessible IDs 404.

## Dashboard and agent performance reports

These read-only APIs aggregate the existing backend records. No frontend is
included. New logins receive `reports:read`; older tokens retain their existing
abilities and must be replaced by logging in again. No new migrations are needed
for reporting (the existing property and site visit migrations must be applied).

| Method | Path (after `/api/v1`) | Required access |
|---|---|---|
| GET | `/admin/reports/overview` | `property-reports` + `reports:read` |
| GET | `/admin/reports/agents` | `property-reports` + `property-reports.agents` + `reports:read` |

Report access does not grant access to a source module. Each section additionally
requires both the source role permission and source token ability below. A role
with permission type `all` passes ACL checks but still obeys token abilities and
own/group/global data visibility.

| Section | Source role permission | Source token ability | Filtered date |
|---|---|---|---|
| properties | `properties` | `properties:read` | property created_at |
| enquiries | `properties.enquiries` | `enquiries:read` | enquiry created_at |
| leads | `leads` | `leads:read` | lead created_at |
| follow_ups | `leads.view` | `leads:read` | task schedule_to (due date) |
| site_visits | `visits` | `visits:read` | visit starts_at |

Both endpoints accept `from` and `to` as **calendar dates** (`YYYY-MM-DD`), unlike
the timestamp filters on the visit/follow-up listing APIs. Dates use the configured
application timezone (`Asia/Kolkata` locally). Either bound may be omitted; no
bounds means all dates. Days are inclusive: `to=2026-11-10` includes everything
before the following local midnight. When both bounds exist, to must be at or
after from. Supported date years are 1000–9998. Invalid filters return 422.

Optional `user_id` narrows the caller's existing scope. It cannot widen it.
Out-of-scope and nonexistent user IDs both produce zero totals/empty agent lists;
there is no staff lookup through this filter. Properties, enquiries, leads and
visits use their own current user_id. Follow-ups use linked leads' current owners,
not the activity author. Reassignment therefore affects reports immediately.

Example request:

```http
GET /api/v1/admin/reports/overview?from=2026-11-01&to=2026-11-30
Authorization: Bearer <access_token>
Accept: application/json
```

Illustrative response for a user without enquiry access:

```json
{
  "data": {
    "properties": {"total": 8, "available": 5, "reserved": 0, "sold": 1, "rented": 1, "unavailable": 1},
    "enquiries": null,
    "leads": {"total": 5, "open": 3, "won": 1, "lost": 1, "unclassified": 0},
    "follow_ups": {"total": 6, "pending": 4, "done": 2, "overdue": 1, "undated": 0},
    "site_visits": {"total": 4, "scheduled": 2, "completed": 1, "cancelled": 1, "no_show": 0, "upcoming": 1}
  },
  "meta": {
    "period": {"from": "2026-11-01", "to": "2026-11-30", "timezone": "Asia/Kolkata"},
    "user_id": null,
    "as_of": "2026-11-10T12:00:00+05:30",
    "available_sections": ["properties", "leads", "follow_ups", "site_visits"]
  }
}
```

Unavailable sections are `null`, never zero, and omitted from available_sections.
Permitted sections with no matching records contain integer zero counts. Overview
still returns 200 when every section is unavailable. Responses contain no record
IDs, property titles, customer contacts, private notes, feedback or addresses.
Both endpoints send `Cache-Control: no-store`.

Metric definitions:

- Property totals include unpublished inventory and all statuses; they describe
  staff inventory, not just the public catalogue.
- Enquiries have no separate workflow status today. `linked_to_lead` and
  `without_lead` reflect whether lead_id is currently present. An enquiry whose
  lead/property was deleted still counts under its original owning user.
- Lead buckets use the current pipeline stage code: won, lost, other codes as
  open, and missing/null stages as unclassified. Legacy boolean status is not
  used. Lead totals include all CRM leads in scope, not only property enquiries.
- Follow-ups count task activities linked to at least one visible lead. Notes,
  meetings and activities without visible lead links are excluded. A shared task
  counts once, even if several visible leads link to it. Pending/done follow
  is_done; overdue is the pending subset whose non-null due date is strictly
  before as_of. Undated tasks are included only when no date bounds are set;
  they can be pending/done but never overdue.
- Visit buckets use current status. Upcoming is the scheduled subset whose start
  is at or after as_of. Past scheduled visits remain scheduled but are not
  upcoming. Date bounds apply to the scheduled start, not creation/outcome time.
- `as_of` is captured once per response for the overdue/upcoming comparison.
  Statuses and ownership are current when queried. Date filters select cohorts;
  they do **not** reconstruct historical status, count status changes during a
  period, measure revenue, or attribute past results to former agents.

Agent reports return the same lead and visit buckets per current agent, with
`user_id`, `name`, `active`, `leads` and `site_visits`. A source metric without
access is null. At least one of leads/site_visits must be accessible, otherwise
403. Only agents with at least one matching accessible lead or visit are listed;
inactive agents with matching history remain included. Staff without matching
records are omitted. No customer information or staff email is returned.

`/admin/reports/agents?from=2026-11-01&to=2026-11-30&per_page=20&page=1`
uses standard `data`, `links`, `meta` pagination (per_page 1–100, default 20),
ordered by user ID. Meta also includes period, user_id, as_of and
available_sections (leads/site_visits only). Lead and visit aggregates are joined
independently to prevent multiplication when one agent has many of each.
Unassigned leads can appear in a global overview but have no agent row, so agent
sums need not equal global totals. Deleted records are not reconstructed.

## Private property documents

The document API is separate from public property photos. It accepts registry,
agreement, floor-plan and ownership-proof files for properties in the caller's
own/group/global scope, including unpublished or sold/rented properties.
Run migrations before using it. New logins receive `documents:read` and
`documents:write`; existing tokens retain their old abilities and require a new
login. Existing custom roles must be granted the appropriate new ACL permissions.
All-permission roles pass ACL checks but still obey token abilities and scope.

| Method | Path (after `/api/v1`) | Required role permissions | Token ability |
|---|---|---|---|
| GET | `/admin/properties/{propertyId}/documents` | `properties`, `properties.documents` | `documents:read` |
| POST | `/admin/properties/{propertyId}/documents` | `properties`, `properties.documents.create` | `documents:write` |
| GET | `/admin/properties/{propertyId}/documents/{id}/download` | `properties`, `properties.documents` | `documents:read` |
| DELETE | `/admin/properties/{propertyId}/documents/{id}` | `properties`, `properties.documents.delete` | `documents:write` |

There are no public document routes or public/signed file URLs. Listing or editing
a property alone does not grant document access. General property resources do
not embed document metadata. Document ownership follows the **current property's
assigned agent**, not the uploader. Each document ID must also belong to the
property ID in the nested URL. Missing/out-of-scope properties, mismatched document
IDs and deleted documents return 404. Authentication failures return 401; missing
ACL/token ability or inactive users return 403.

Upload one file per multipart POST with fields:

| Field | Rules |
|---|---|
| title | Required string, maximum 150 characters |
| category | Required: registry, agreement, floor_plan, ownership_proof, other |
| description | Optional/null string, maximum 1,000 characters |
| file | Required PDF, JPEG or PNG; maximum 10 MiB (10,240 KiB) |

The file content MIME is inspected on the server and must match its filename
extension (pdf, jpg/jpeg, png). The browser's Content-Type is not authoritative.
Empty files, scripts/HTML, SVG, archives, Office formats, unsupported extensions
and mismatched extensions/content return 422. Type validation does not parse or
rewrite documents. There is a maximum of 50 active documents per property; the
parent is locked during writes so uploads/deletion cannot bypass that limit.
Extra server-owned fields such as path, uploaded_by, property_id, MIME, size and
checksum are ignored. Uploading the same file again creates a separate document;
there is no replacement/versioning endpoint.

```sh
curl -X POST "$BASE_URL/api/v1/admin/properties/12/documents" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Accept: application/json' \
  -F 'title=Property registry' \
  -F 'category=registry' \
  -F 'description=Registered ownership record' \
  -F 'file=@/path/to/registry.pdf'
```

A successful upload returns 201:

```json
{
  "data": {
    "id": 7,
    "property_id": 12,
    "title": "Property registry",
    "category": "registry",
    "description": "Registered ownership record",
    "original_name": "registry.pdf",
    "mime_type": "application/pdf",
    "size_bytes": 32768,
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "uploaded_by": 3,
    "created_at": "2026-10-31T12:00:00+05:30",
    "download_url": "/api/v1/admin/properties/12/documents/7/download"
  }
}
```

The checksum above illustrates the 64-character format; actual SHA-256 and byte
size are calculated from the uploaded content. `original_name` is a sanitized,
length-bounded download filename: directories, control/bidi characters and unsafe
header characters are removed/replaced, and the extension is normalized. UUID
storage names and disk paths are never exposed. The relative download_url requires
the Authorization header on every request; it is not a public link.

Listing accepts category, page and per_page (1–100, default 20), newest document
ID first. It returns the same metadata in the standard data/links/meta pagination
envelope. Downloads stream the stored bytes as an **attachment**, with the detected
Content-Type, Content-Length, X-Content-Type-Options: nosniff and private/no-store
cache control. All document responses disable caching. There is no inline viewer.
A missing stored file returns JSON 404; storage write/read failures return 503
before streaming. A transfer interrupted after streaming begins cannot be replaced
with a JSON response. An already-open download may finish if deletion occurs
concurrently.

DELETE returns 204. The document becomes inaccessible when the transaction commits;
repeat download/delete returns 404. Private bytes are removed after commit, then
metadata is permanently purged. A database rollback keeps the existing document
and bytes. Upload failures/transaction rollback attempt to remove new bytes.

Deleting a property through the existing property API also deletes its documents,
including when the caller has property-delete permission without separate
document-delete permission. This follows permission to delete the entire parent.
If private file deletion fails, the API deletion still succeeds and an inaccessible
soft-deleted row retains the path for retry. If the parent was removed, that row
has a null property_id. The `property-documents:cleanup` command retries tombstones,
including already-missing files, and exits nonzero if any purge remains pending.
It is registered hourly with Laravel's scheduler; a deployed application must run
the standard `php artisan schedule:run` cron (or invoke cleanup directly).

Files use the dedicated local `property_documents` disk, rooted at
`storage/app/private/property-documents`, with private visibility and serving
disabled. It is independent of the default/public disk and must remain outside
public web roots/symlinks. Preserve this directory with the database when backing
up or moving environments. Database schema rollback does not remove file bytes.
The retry command handles recorded deletions. Failed rollback cleanup is logged;
abrupt process termination can also leave unreferenced files for operator
reconciliation.

## Property deal reservations and confirmation

This is an exclusive sale/rent property workflow. A reservation holds one property
for a lead's customer. Booking amounts are recorded advances, not online payment
collection or proof of payment. Cancelling does not initiate a refund. Confirming
a rental marks the whole property rented; dated room/stay bookings and subsequent
rental renewals remain separate workflows.

Run the new deal-table migration. New login tokens include `deals:read` and
`deals:write`; existing tokens must be renewed by logging in again. Custom roles
need explicit new deal permissions. Source property/lead permissions and token
abilities are independently checked for writes.

| Method | Path (after `/api/v1`) | Deal permission | Token ability |
|---|---|---|---|
| GET | `/admin/property-deals` | `deals` | `deals:read` |
| GET | `/admin/property-deals/{id}` | `deals.view` | `deals:read` |
| POST | `/admin/property-deals` | `deals.create` + `deals.view` | `deals:write` |
| PATCH | `/admin/property-deals/{id}/confirm` | `deals.confirm` + `deals.view` | `deals:write` |
| PATCH | `/admin/property-deals/{id}/cancel` | `deals.cancel` + `deals.view` | `deals:write` |

All write routes additionally require `properties` and `properties.edit`, plus
`properties:read` and `properties:write` token abilities. Reserve/confirm also
require `leads.view` and `leads:read`. Cancellation can release a hold after the
lead/customer is closed or deleted and does not require lead access. An actual
property change requires current property visibility; confirmation additionally
requires current lead visibility. Read routes use the deal's own scope and do not
require current source records or source-module rights.

Deal user_id is assigned server-side from the property's agent when reserved.
Own/group/global scopes apply to that assigned agent, including for all-permission
roles; an empty group sees no deals. The creator is separately recorded. Property
or lead reassignment does not transfer the deal, and this phase has no deal agent
reassignment endpoint. A manager with the appropriate global/group scope can
handle a deal when its agent no longer has access to the source property/lead.

Reserve with an available property and an open lead that has a customer:

```json
{
  "request_id": "0d59a581-8794-4980-a88c-5bdd03ef6cee",
  "property_id": 12,
  "lead_id": 9,
  "agreed_price": "6500000.50",
  "booking_amount": "50000.25",
  "payment_reference": "Offline receipt reference",
  "notes": "Customer agreed terms"
}
```

- request_id is a required client-generated UUID. Retry an uncertain POST using
  the same key and payload. A new reservation returns 201; an equivalent retry
  by the same creator returns the existing deal with 200, without new events.
  Equivalent decimal strings are normalized, UUID case is ignored, and omitted
  booking_amount is equivalent to 0.00. Retrying after confirmation/cancellation
  returns the existing terminal deal without holding the property again. Reusing
  the key with a different payload or creator returns 409; current deal scope
  must still allow a replay. A new reservation after cancellation needs a new key.
- agreed_price and booking_amount must be **decimal strings**, with up to 13
  integer digits and two fractional digits, maximum 9999999999999.99. Scientific
  notation, negatives, JSON numbers and additional decimal places are rejected.
  agreed_price must be positive. booking_amount defaults to 0.00 and must not
  exceed agreed_price. Comparison/storage uses exact cents, never float arithmetic.
- agreed_price is the negotiated total commitment for this deal (including for
  rental deals), not an automatic copy/multiplication of the listing's rental
  price. booking_amount is an advance included in that total, not a separate
  security-deposit field. Monetary fields are immutable in this phase; correct
  a reserved deal by cancelling it and creating a new booking request.
- payment_reference is optional/null, maximum 190 characters; notes is
  optional/null, maximum 5,000. These are internal records, not verified receipts.
- Customer, property, purpose, rental period, currency, agent, creator, state and
  timestamps are derived by the server. Extra client fields cannot override them.
  Property publication is not required. The lead may have enquired about another
  property. Reservation and confirmation require the lead to remain open (neither
  a closed_at timestamp nor won/lost stage) and the customer identity to match.

The response contains a data object with ID, property_id, lead_id, user_id,
property title/city, purpose, rent_period, status, agreed_price, booking_amount,
currency and created/confirmed/cancelled timestamps. Detail responses also include
request_id, person_id, created_by, customer name/email/phone snapshots,
payment_reference, notes, cancellation_reason and chronological events. Monetary
values always return as two-decimal strings. Source IDs can become null after
source deletion, while snapshots and financial/event history remain readable.
Internal payload hashes and unique property guards are never returned.

State transitions are transactional:

| Action | Deal state | Property status |
|---|---|---|
| Reserve | reserved | available → reserved |
| Confirm sale | reserved → confirmed | reserved → sold |
| Confirm rental | reserved → confirmed | reserved → rented |
| Cancel reservation | reserved → cancelled | reserved → available |

Confirm with PATCH and an empty body. Cancel with:

```json
{"cancellation_reason": "Customer withdrew"}
```

The reason is required, maximum 1,000 characters. Confirmed/cancelled deals cannot
be reopened or changed to the other terminal state. Repeating the same terminal
action is a no-op: original timestamp, reason and event count remain unchanged
(the cancel request still requires a valid reason). Source ACL/abilities are
rechecked even on retries; a no-op does not require a still-existing source record.
Confirmation validates the property purpose/rental period, reserved state, hold
ownership and customer identity again. Cancellation never overwrites an unrelated
externally changed property status. It retains the recorded booking amount and
payment reference; neither money movement nor refund accounting is performed.

Property locks serialize reservations, edits, deletion and transitions; current
locking reads and a nullable unique active_property_id guard prevent a second
reserved/confirmed deal for the same property. Cancelled deals release the guard.
Property/deal changes and the audit event commit or roll back together. Events
record the acting user, action, property/state changes, and original advance/
agreed price when reserved. Real two-process integration tests verify competing
reservations and identical concurrent retries against MariaDB.

Reserved properties disappear from the public catalogue and public enquiry flow;
existing publication/enquiry flags are preserved, so cancellation makes the
property public again only when the normal visibility rules allow it. Existing
scheduled visits remain unchanged; new scheduling/rescheduling requires an
available property as before. Confirmation changes property status only: it does
not mark the CRM lead won, change lead products, send notifications or take money.
Use the existing lead-stage API separately after confirmation if appropriate.

`reserved` is a new inventory status, included in admin property filters and
`data.properties.reserved` in dashboard reports. It cannot be manually created.
While a reserved/confirmed deal controls a property, ordinary property PUT cannot
change its controlled status, purpose or rental period. Other listing edits remain
allowed when the full PUT includes the controlled values. A reserved property
cannot be deleted: cancel its hold first. Confirmed/cancelled property deletion
retains financial history through nullable source references. Confirmed deals
remain final in this phase; there is no reversal, rental-ending or expiry API.
Rolling back the schema does not undo inventory status changes; preserve deal
history and reconcile active reservations before any operator-led rollback.

Deal lists support status (reserved/confirmed/cancelled), purpose, property_id,
lead_id, user_id, from/to (inclusive ISO timestamps with seconds and timezone,
filtering created_at), page and per_page (1–100, default 20). Results use
newest-ID-first data/links/meta pagination. Lists omit customer contact/identity,
request ID, notes, payment references, cancellation reasons and audit details;
those require deals.view. Successful deal responses send Cache-Control: no-store. There
is no public or hard-delete deal endpoint. Invalid money/transitions/source state
return 422, missing/out-of-scope records return 404, missing ACL/abilities return
403 and absent/expired/revoked authentication returns 401.
