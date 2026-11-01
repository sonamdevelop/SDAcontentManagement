# SDAcontentManagement

The Laravel/Krayin backend lives in [`backend/`](backend/). The public property
website lives in [`web/`](web/) and connects to its public APIs.

- [Backend setup and tests](backend/SETUP.md)
- [API v1 documentation](backend/docs/API.md) and [OpenAPI](backend/docs/openapi.json)
- [Postman and client integration kit](backend/docs/INTEGRATION.md)
- [Public website setup, tests and deployment](web/README.md)
- [Read-only source provenance](web/SOURCE_PROVENANCE.json)

The website supports property browsing/filtering, public details/photos and
consented enquiries. Staff workflows include property/lead management and site
visits. Firebase data/account migration and mobile integration remain separate work. The original Stay in Dandeli and Buy Rent Sell
Admin repositories are read-only references; all changes are made in SDA.


Staff workspace: the SDA React frontend now includes `/staff` for Laravel login,
property creation/editing, photos and publication, overview counts, enquiry/lead lists, lead detail/assignment/stage changes and
notes with dated follow-up tasks, plus site visit scheduling, outcomes/history and private property documents. See [web setup and permissions](web/README.md#staff-workspace).
Both reference repositories remain read-only. This does not deploy changes to
stayindandeli.in or migrate the Firebase app.


Current staff workflow status: property/enquiry management, leads/follow-ups,
site visits and private documents have web screens. **Property deal management**
(reservation, advances, confirmation/cancellation and history) is the remaining
major staff UI module in the current plan. Room/stay booking integration and
mobile/Firebase account/data migration are separate later phases; production
rollout still needs deployment and acceptance checks.
