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
Create/publish records through the existing backend APIs/Postman kit first.
Existing Firebase listings and room bookings are not automatically migrated.

The existing stay/booking website remains reachable through **Explore stays**.
Its Laravel 11 room/booking backend was not copied into the Laravel 12 CRM. This
phase is the public property website; staff dashboard, Firebase account/data
migration, customer authentication and mobile wiring are later work.

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
future staff UI must use actual Laravel authentication and server-side ACL/scope.
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
