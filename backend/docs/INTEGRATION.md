# Web and mobile API integration kit

The public property website now lives in [web/](../../web/README.md) and connects
to catalogue, detail and enquiry APIs. Staff/mobile integration remains separate.
The backend is ready for further client integration testing. This kit supplies requests,
configuration examples and a repeatable journey. It does not deploy a staging
server or migrate the existing Firebase/mobile accounts.

## Start locally

From `backend/`:

```sh
bash tools/setup.sh
bash tools/test-api.sh
python3 tools/build-postman.py --check
```

The local API is `http://127.0.0.1:8081/api/v1`. Normal restarts use
`bash tools/start.sh`. Setup preserves existing data and keys; see [SETUP.md](../SETUP.md).
Docker Compose here is a local development service, not a production web server.

Merge the relevant values from [local.env.example](../environments/local.env.example)
into your ignored `.env`, especially `PROPERTY_API_ALLOWED_ORIGINS`. Do not replace
an existing `.env` with this partial example. The example permits common local
frontend origins on ports 5173/3000; change these to the actual frontend address.
After configuration changes run `php artisan config:clear` (prefix with
`docker compose exec -T app` locally). Browser CORS is disabled by default until
an explicit allowlist is configured. No CORS setup is needed for Postman or native
mobile HTTP clients, but the demo's preflight assertion tests the configured origin.

## Import and run Postman

Import these files from `docs/postman/`:

- `SDA-workflow.postman_collection.json`: ordered, executable complete journey.
- `SDA-reference.postman_collection.json`: all 42 documented operations; select
  individual requests after filling the relevant IDs. It is not an ordered runner.
- `SDA-local.postman_environment.json` or `SDA-staging.postman_environment.json`.

Select an environment and fill:

| Variable | Value |
|---|---|
| base_url | API prefix including `/api/v1`, without trailing slash |
| frontend_origin | Exact browser origin configured in the backend allowlist |
| staff_email / staff_password | Authorized Laravel staff account for this dataset |
| document_file | Absolute local path to `docs/postman/fixtures/registry.pdf` |

Checked-in passwords and tokens are blank. The generated local environment does
not contain login credentials. The generated development database's example
admin is documented in SETUP.md; use a dedicated staff account for integration
work. The full demonstration needs all of the module permissions (or a local test
role with permission_type=all), matching record visibility and a fresh login.
Least-privilege accounts can instead exercise individual reference requests.

Run the **Complete workflow** folder in order. Enable stop-on-error in your runner
when available. It initializes fresh UUIDs, clears stale record IDs and creates a
fictional property/customer enquiry. It then tests:

1. Login, browser preflight and current staff profile.
2. Published property, private-field protection, public enquiry and same-key retry.
3. Staff enquiry-to-lead lookup, note/task creation and task completion.
4. Visit scheduling, rescheduling and cancellation.
5. Private document upload/list/download (upload/download/delete are skipped when
   document_file is blank; set it for full coverage).
6. Reports, reservation, idempotent retry and disappearance from the public catalogue.
7. Cancellation/release, rebooking with a new key, confirmation and terminal retry.
8. Agent report, document/property deletion, retained deal audit history, logout
   and verification that the revoked token no longer works.

Successful execution with the sample PDF sends 38 requests and checks 50
assertions. Use a disposable local/test or staging dataset: the demo creates
fictional records. It deletes only the property/document IDs captured during that
run. CRM customer, enquiry, follow-up, visit and financial audit history remain by
API design; there is no public hard-delete-history endpoint. Nothing collects
money. An interrupted run can leave its fixture records and login token active;
use the captured IDs to review/cancel a hold and log out before discarding the
private environment.

The workflow captures tokens and IDs into the selected environment's local values.
Logout clears access_token. Keep credential/current-value exports private and out
of Git. Do not put staff tokens in public website bundles. For a CLI runner, use a
private environment export under ignored `.runtime/`, with restrictive file
permissions, rather than credentials on the command line:

```sh
npx --yes newman@6.2.1 run docs/postman/SDA-workflow.postman_collection.json \
  --environment .runtime/postman-local.private.json --bail
```

This optional command needs Node/npm and registry access. Newman does not enforce
browser CORS itself; the preflight assertion and backend HTTP tests verify it.
Reference requests show sample bodies and endpoint-specific permissions. Fill
IDs and ISO timestamps manually or reuse values captured by a workflow run.
Document upload is multipart; let Postman set Content-Type and its boundary.
The reference property PUT example is a full replacement body; retain the current
controlled status/purpose/rental period when a deal exists.

After updating OpenAPI or examples, regenerate and verify artifacts:

```sh
python3 tools/build-postman.py
python3 tools/build-postman.py --check
```

The generator checks in reproducible JSON and an original fictional sample PDF;
no credentials, customer documents or binary API responses are included.

## Browser and mobile transport

The browser sends bearer tokens, not session cookies, to this API:

```js
const response = await fetch(`${apiBase}/admin/properties?page=1&per_page=20`, {
  headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  credentials: 'omit',
});
if (response.status === 204) return;
const payload = await response.json();
```

For JSON writes, add Content-Type: application/json. For files, use FormData and
allow the browser to generate Content-Type. Uploading photos with a full property
PUT uses POST plus `_method=PUT`; document uploads use POST directly. Collections
return data/links/meta; keep pagination and filter state in the client. Amounts
return as decimal strings; keep deal amounts as strings when sending them.

Only `/api/v1` uses the API origin policy. Origins must be exact HTTP/HTTPS
scheme/host/port values, separated by commas. Wildcards, opaque/null origins,
credentials in origins, query/fragment and non-root paths are ignored. Changing
the browser origin does not grant user permissions. Unlisted origins receive no
CORS grant; native clients must still pass the same authentication/ACL/scope checks.
Existing CRM web-form CORS policy is separate and unchanged. API responses expose
Content-Disposition, Content-Length and Retry-After to permitted browser origins.

A private document is fetched with Authorization, converted to a Blob, and offered
as a download. Use Content-Disposition for its sanitized filename. Do not navigate
an unauthenticated `<a>` directly to download_url or treat it as a public asset.
Public property photos are separate public URLs and must not contain documents.

| Response | Client behavior |
|---|---|
| 200/201/202 | Read the documented envelope; 202 enquiry is a generic acknowledgement, not a public lead ID |
| 204 | Success with no JSON body |
| 401 | Clear rejected token and show staff login; this API has no refresh-token endpoint |
| 403 | Explain missing permission/ability or inactive account; logging in does not grant a missing role permission |
| 404 | Missing or out-of-scope record; do not reveal which case to the user |
| 409 | Reused booking/enquiry key conflicts; preserve original payload/key for a genuine retry |
| 422 | Map errors to form fields; keep user input |
| 429 | Respect Retry-After when present and back off |
| 503/network | Show a retry option; preserve booking/enquiry idempotency keys for uncertain writes |

Only enquiry submissions and deal reservation requests have explicit idempotency
keys. Do not automatically retry document/photo uploads or other POST creation
requests as if they were idempotent. Reserve/confirm/cancel state retries follow
the documented state rules; a new deal after cancellation needs a new request_id.

## Local versus staging configuration

[staging.env.example](../environments/staging.env.example) is a template, not a
provisioned environment. Replace the example hostnames and supply deployment
secrets privately. For an existing installation preserve APP_KEY, database
credentials and file volumes. For a new installation create APP_KEY once using
Laravel's normal key-generation process. Do not use the local seeded admin or
local Compose database credentials for a deployed service.

Use a normal HTTPS web server/PHP-FPM with the document root at `backend/public`.
Keep `APP_DEBUG=false`, use the actual external APP_URL and exact frontend HTTPS
origins, install locked Composer dependencies, and apply `php artisan migrate
--force` before client rollout. Build configuration cache after environment values
are supplied. Use `php artisan storage:link` only for public photos; private
`storage/app/private/property-documents` must not be publicly linked. Preserve
public/private file volumes with database backups. Configure the standard Laravel
scheduler each minute for hourly failed-document cleanup retries. No inbound-mail,
Google OAuth, payment or real outbound-mail integrations are enabled by this kit.

Staff tokens remain subject to expiration, revocation, active status, live role
permissions and own/group/global scope. Existing tokens do not acquire abilities
added after they were issued. Re-login after a backend upgrade when needed.
This kit adds CORS/configuration only; it needs no new database migration.

## Frontend implementation checklist

| Client area | API contract / integration requirement |
|---|---|
| Public website catalogue | `/properties`, filters, public detail and pagination |
| Enquiry form | UUID submission_id per submission; reuse it for a retry; require consent |
| Staff property editor | Staff login, full property fields, photo multipart uploads, draft/publication controls |
| CRM work queue | Scoped leads, pipelines/stages, assignment and follow-ups |
| Visits | Agent choices, explicit ISO timezone timestamps, conflict validation and status actions |
| Documents | Separate ACL checks, authenticated download, private metadata, file-size/type errors |
| Deals | Decimal strings, request UUID persistence, reserved/sold/rented states and cancellation reason |
| Dashboard | Date-only report filters, available_sections/null distinction, per-agent pagination |
| Existing Firebase mobile users | Plan account/ID migration or a verified auth bridge before private calls; Firebase ID tokens are not Laravel staff tokens |
| Stay/room booking app | Its dated room bookings are separate from the current exclusive property-deal workflow |

Do not assume the existing Firebase app's users have matching Laravel staff IDs,
roles or ownership. Public catalogue/enquiry requests need no staff login. Before
connecting private mobile operations, decide how those accounts map to the staff
API or implement the required separate customer authentication workflow. No
customer signup or Firebase-token exchange endpoint currently exists.

Public web catalogue/detail/enquiry pages are implemented in `web/`. Next connect
the staff web login/editor and the remaining staff workflows. Mobile wiring
follows once its auth/account mapping is defined. Automated tests cover the backend contracts; actual browser,
frontend component and mobile device acceptance tests belong to that next phase.

See [API.md](API.md) and [openapi.json](openapi.json) for complete request schemas,
permissions, validation and current feature limitations.
