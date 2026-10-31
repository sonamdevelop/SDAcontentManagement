# SDA development

The Laravel/Krayin backend lives in `backend/`. Read `backend/AGENTS.md` and its
referenced skills. Work on backend APIs first; do not change web/app frontends
unless requested. Every feature requires meaningful unit and integration tests.
Use an isolated test database and array test cache, never development data.
Never claim unavailable old workspace files were restored: this backend was
reconstructed from upstream Krayin and the conversation's domain requirements.
Keep code within this repository so changes can be reviewed and versioned.

## Read-only reference repositories

`sonamdevelop/stayindandeliwithdashboard` and `sonamdevelop/buy-rent-sell-admin`
are read-only references. Do not edit, commit or push in either repository.
Curated frontend code/assets may be brought into this SDA repository with source
provenance. The public frontend lives in `web/`; read `web/AGENTS.md` for its tests.
