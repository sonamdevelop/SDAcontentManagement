# SDAcontentManagement

The Laravel/Krayin backend lives in [`backend/`](backend/). The public property
website lives in [`web/`](web/) and connects to its public APIs.

- [Feature progress and web/mobile readiness audit](backend/docs/READINESS.md)
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
site visits and private documents have web screens. **Property deal management** now includes staff reservation, recorded advance, confirmation/cancellation and history screens. Online payment integration and
mobile/Firebase account/data migration are separate later phases; production
rollout still needs deployment and acceptance checks.

Staff stays and room bookings now have separate inventory, date-based availability, exact advance/balance records and cancellation history. See [stay booking documentation](backend/docs/STAYS.md). Customer reservations are available; online payment and legacy migration remain later phases.

Stay booking details also support staff check-in/check-out, attendance filters and actor/time history without changing booked charges or inventory dates.

Stay bookings now include an immutable offline payment ledger with additional receipts, refunds, corrections and exact outstanding/refund balances. See [ledger documentation](backend/docs/PAYMENTS.md).

Staff can inspect nightly room allocation and remaining capacity through **Availability calendar**, including scoped date ranges and cancellation refresh.

**Stay operations** provides scheduled arrivals/departures and live in-house/overdue queues with booking links and scoped guest names.

**Payment follow-up** now lists scoped pending collections and refunds with exact current ledger balances and links to booking details.

**Stay bookings** can be filtered by booking/stay IDs and inclusive scheduled arrival dates, together with status, room and attendance filters.

**Printable stay statements** present booking charges, complete offline payment/correction history and current balances with a print layout that omits staff controls and internal metadata.

**Public stay catalogue** now lives at `/stays`, with stay/room descriptions, amenities, rules, galleries and exact nightly rates. Staff manage content/publication separately from inventory. Customer login, dated availability and zero-advance reservations are available.

**Customer accounts** now have separate signup/login/profile/password-change screens and read-only owned booking list/detail at `/account`. Existing bookings are not auto-linked by email; email-change verification and native migration remain pending. See [customer identity and ownership rules](backend/docs/CUSTOMERS.md).

Customer dated reservations are now available from public stay room cards: sign in,
check availability, review and confirm, then read the owned booking. No online money
is collected. See [reservation rules](backend/docs/RESERVATIONS.md).

Customer email verification and password recovery are implemented. New reservations require verified email; existing owned reads and exact request replay remain available. See [account recovery and mail configuration](backend/docs/CUSTOMER_RECOVERY.md). Live SMTP delivery remains a deployment-time check.

Customer cancellation requests and staff approve/reject review are available, with complete history and no automatic refunds. See [cancellation rules](backend/docs/CANCELLATIONS.md).

Property publication now requires moderation approval. Public content/photo edits require a fresh review; private edits and deal status retain approval. Staff use the scoped Property moderation queue with reasons, snapshots and safe revision retries. Existing published listings retain legacy approval. See [moderation rules](backend/docs/MODERATION.md).

Customer saved properties and scoped staff popularity are available. Hidden/unreviewed listings show an unavailable placeholder without current private details. Older customer sessions must sign in again for customer:favourites. See [saved-property rules](backend/docs/FAVOURITES.md).

Agent performance now has a dedicated web report with calendar timezone/date/agent filters, source-aware outcome bars and scoped all-filtered-agent CSV export. See [agent report rules](backend/docs/AGENT_REPORTS.md).
