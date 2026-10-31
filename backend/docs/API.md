# Property backend API v1

API prefix: `/api/v1`. Send `Accept: application/json`. JSON bodies use
`Content-Type: application/json`. The versioned API is stateless, including when
an Origin/Referer header is present. Staff requests use Sanctum personal access
tokens; web sessions are not accepted. No web/mobile frontend has been connected.

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
sqft/sqm/acre. Status: available/sold/rented/unavailable; sold applies only to sale,
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
Firebase data migration, customer account authentication and booking APIs remain
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
