# Backend setup and validation

Source: Krayin CRM (MIT), upstream commit
`5eecae04634a6790bf2fe68904ee3e973cb24e7b`. This backend was reconstructed after
an environment failure; the unavailable prior workspace was not restored byte
for byte. Property/enquiry domain behavior is implemented in the extension package
`packages/Webkul/Property`. Existing upstream CRM frontend assets are retained;
no custom web/mobile frontend is implemented or connected in this phase.

Requirements: Linux with Docker Compose, Python 3, and enough disk for PHP/MariaDB
images. From this `backend/` directory:

```sh
bash tools/setup.sh
bash tools/test-api.sh
```

Setup preserves an existing `.env`, application key and populated database. It
runs migrations and seeds only an entirely empty development database. Never run
upstream `krayin-crm:install` or migrate:fresh on populated data: those commands
can delete records. Normal restarts use `bash tools/start.sh`, which also checks an actual API response.

Dependencies use the existing Composer lockfile. The helper caches the exact
locked GitHub archives from official codeload URLs over verified TLS, checks any
locked SHA-1 checksum, verifies archive CRCs and source/commit identity, then lets
Composer install from its normal cache with networking disabled. No lockfile,
checksum or TLS verification is bypassed. It avoids downloading complete Git
histories and fits the managed environment's allowed GitHub endpoints. Cached
archives and dependencies live under ignored `.runtime/` and `vendor/` paths.
In managed clouds preserve inherited proxy variables and CA trust. Follow the
cloud runtime skill before Docker operations; command escalation may be needed.

The local API service is bound to loopback port 8081; database has no published
host port. The generated `.env` uses INR, Asia/Kolkata, log mail, and local-only
example credentials. The upstream seeded admin is admin@example.com / admin123.
Replace all development defaults before deployment. No secrets belong in Git.

The test script uses a separate krayin_test database and an array cache. Its
CREATE DATABASE/GRANT command assumes the generated local defaults; adapt those
selectors if you intentionally customize local database usernames/passwords.
Never run tests against production/development data. API tests cover auth,
expiry/revocation, role/ability checks, record scopes, public privacy, property
CRUD, files, filters, enquiry idempotency, rollback, lead assignment/stages,
notes, dated follow-up tasks, and site visit scheduling/status/audit integration.
Site visit tests include two concurrent PHP processes against MariaDB; PHP
`proc_open` must be enabled. Apply migrations before using the new endpoints,
and log in again to obtain the new visit token abilities.

Read [docs/API.md](docs/API.md) and [docs/openapi.json](docs/openapi.json) for the
contract. Runtime processes do not survive snapshots. Code is now inside the
SDA Git repository; keep a Git commit/remote backup or publish a verified
workspace snapshot before replacing environments. A local setup does not prove
fresh-task snapshot restoration, and nothing is deployed publicly.
