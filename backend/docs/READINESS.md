# SDA feature and client readiness audit

Audit date: 3 November 2026 (Asia/Kolkata). Application code assessed: `4598f73`.
Reference snapshots: Stay in Dandeli `f46b609`, Buy Rent Sell admin `1827aaa`.
Both reference repositories were inspected as read-only source references. Their
running services, Firebase datasets and production deployments were not tested.
No reference code/data was imported or modified during this audit.

## Current conclusion

SDA has a locally tested responsive property website and staff web workspace.
The full customer stay website and a native mobile application are not ready.
The Buy Rent Sell reference is itself a React/Firebase **web admin**, not an
Android/iOS client. No native/mobile source tree, device build or device test
configuration was found in any of the three supplied repositories. Mobile-sized
Chromium tests establish responsive web behavior, not native app readiness.

This is local implementation readiness. No staging or production readiness is
claimed. Staging/deployment are intentionally deferred at the user's request.

## Feature comparison

“Local ready” means the listed SDA workflows are implemented and covered by the
current isolated API/web checks; it does not mean full parity or production signoff.
“Partial” means a related capability exists but the reference experience is not
fully delivered. “Pending” means absent or, for native clients, source/build not
provided and delivery cannot be verified.

| # | Feature group | SDA status | Delivered / remaining |
|---|---|---|---|
| 1 | Staff authentication and access scope | Local ready | Laravel bearer login/logout, abilities, live roles, own/group/global scope. Customer authentication is separate. |
| 2 | Staff property management | Local ready | Create/edit, photos, public/unpublished controls and enquiry settings. Property deletion exists in the API but has no React inventory-delete action. |
| 3 | Public property discovery and enquiries | Local ready | Buy/rent catalogue, filters, detail/gallery, consented idempotent enquiries. |
| 4 | CRM lead work | Local ready | Leads, assignment, pipeline-stage changes, notes and dated follow-up tasks. |
| 5 | Site visits | Local ready | Scheduling/conflicts, reassignment/rescheduling, outcomes, feedback and history. |
| 6 | Private property documents | Local ready | Scoped upload/download/deletion, file validation and cleanup retries. Guest identity proof is a different missing domain. |
| 7 | Property deals | Local ready | Reservation, advance snapshot, confirm/cancel and history, linked inventory visibility. This is not a general property-deal payment ledger. |
| 8 | Staff stay inventory and bookings | Local ready | Stays, room-type quantities/capacity/rates, availability, booking creation/cancellation and finder. A booking covers one room type, possibly multiple rooms. |
| 9 | Stay attendance and operations | Local ready | Check-in/out, audit history, nightly calendar and arrivals/departures/in-house/overdue queues. |
| 10 | Offline stay finance | Local ready | Payments/refunds/reversals, exact balances, payment follow-up and complete printable statements. Statements are not tax invoices. |
| 11 | Reports and analytics | Partial | React overview plus overview/agent APIs exist. Reference chart dashboards, report exports and a dedicated React agent-report experience are not complete. Stay revenue/occupancy analytics are not delivered. |
| 12 | User/role administration | Partial | Krayin has existing user/role/group administration. SDA React has no equivalent user-management workspace; Firebase customer users are not mapped/migrated to it. |
| 13 | Rich stay/room content | Partial | Inventory names/city/timezone/rates exist. Reference room photos/gallery, amenities, descriptions, rules and publication are not implemented in the SDA stay model/UI. |
| 14 | Property listing moderation | Pending | Reference pending/approved/rejected review queue is absent. SDA publication boolean is not an approval workflow with rejection reasons/history. |
| 15 | Property favourites | Pending | Reference user favourites/popularity views are absent from SDA; no customer favourites API or UI. |
| 16 | Customer account flows | Pending | Customer signup/login/recovery/profile and customer-owned “my bookings” are absent from SDA's domain API/web. Staff credentials must not stand in for customer auth. |
| 17 | Public stay discovery and booking | Pending | No SDA public stay/room catalogue/detail/availability/reservation journey. “Explore stays” currently links to the legacy website. Existing booking endpoints are staff-only. |
| 18 | Native/mobile application | Pending / unverified | No supplied Android/iOS/Flutter/React Native source or device builds. No Laravel client integration, secure device token storage or native acceptance evidence. |
| 19 | Data/account migration | Pending | No imported Firebase users/properties/favourites or legacy stay users/bookings/files. Need ID/ownership mapping, migration tooling, rehearsal and reconciliation. |
| 20 | Customer communications | Pending | No completed business email/SMS/WhatsApp/push booking confirmation or follow-up delivery workflow. Internal framework notification tests are not evidence of these integrations. |
| 21 | Extended guest booking/onboarding parity | Pending | Reference guest identity-proof handling, adults/children details and mixed room-type reservations are not equivalent to SDA's guest snapshot and single room-type booking. |

Checklist result: **10 local-ready, 3 partial and 8 pending/unverified groups**.
These 21 groups are an explicit audit checklist, not equally sized work units.
10/21 must not be interpreted as a reliable effort, schedule or total-project
completion percentage. A committed product backlog and the actual mobile source
are needed for a defensible overall percentage. Staff core is substantially
implemented; full web + native app delivery still has major customer-side gaps.

## Reference-only and optional scope

The stay reference also contains blog/team/contact and informational pages,
restaurant/menu/private-table/order/notification views/controllers. Some routes
are simple view/template screens; their presence does not prove a finished
business workflow. Decide which belong in SDA before promising full parity.
No food/order/table module or site-wide content CMS has been delivered in SDA.

Online payment gateway/webhooks/reconciliation, tax invoices, seasonal/package
pricing, discounts, room-number assignment, housekeeping, booking amendments and
stay no-show handling are also not implemented. These are future product choices,
not all proven working reference features. The existing ledger records offline
money events; it never collects money or validates gateway settlement.

The property reference also has fields such as facing/furnishing and a different
property/category model. Data/schema mapping must be settled before migration;
matching a few screen names is insufficient to claim field-level parity.
The reference's localStorage admin flag/static login is not an authentication
pattern to copy; SDA's implemented server-side authentication remains the basis.

## Verification on the audited commit

- Isolated API suite: **459 tests, 2,271 assertions passed**.
- Frontend unit/integration: **187 tests across 26 files passed**.
- Production frontend build: **passed**.
- Frontend format check: **passed**.
- Desktop/mobile Chromium browser suite: **46 tests passed**.
- Real Laravel/MariaDB browser journeys: **4 passed** (32.7 seconds).
- Synthetic DB row counts and public/private upload SHA-256 backup/restore: **passed**.
- OpenAPI has **62 documented operations**. Public domain operations cover
  property catalogue/detail/enquiries; staff APIs cover stays/finance. A contract
  and Postman examples do not constitute a delivered native client.

Tests use isolated databases and synthetic fixtures. The real-service runner also
checks synthetic DB backup/restore row counts and public/private upload SHA-256
restoration. No real Firebase/customer migration or remote disaster recovery was
verified. These checks are targeted application regressions, not an exhaustive
certification of every upstream Krayin module, OS/device or production condition.

## Recommended next work, in order

1. **Rich stay content and public stay discovery**: backend first for stay/room
   descriptions, photos/gallery, amenities/rules and explicit publication, then
   public list/detail pages in SDA. This removes the current customer dependence
   on the legacy stay-site link and supplies real content for both web and mobile.
2. **Separate customer authentication and ownership**: signup/login/recovery,
   profile and account-ID mapping decisions, then customer-owned booking access.
3. **Customer booking journey**: public quote/availability, reviewed reservation,
   retry/idempotency and “my bookings”, using server-side inventory protection.
4. **Property parity gaps**: moderation/rejection/history, favourites, user-facing
   reporting/export and any required metadata mapping; explicitly define roles.
5. **Mobile implementation/integration**: obtain the actual mobile source or agree
   a new SDA-owned client, wire the same APIs/auth, and run real device journeys.
   Keep both reference repositories read-only.
6. **Migration and remaining agreed modules**: dry-run ID/ownership/file mapping,
   reconciliation and rollback planning; notifications/payments only if in scope.
7. **Final integrated acceptance, then staging/deployment**: per user direction,
   after agreed features and safety/testing are complete. No staging now.

## Evidence locations

- SDA: `web/src/App.tsx`, `web/src/staff/StaffApp.tsx`,
  `web/src/components/Layout.tsx`, `web/SOURCE_PROVENANCE.json`,
  `backend/packages/Webkul/Property/src/Routes/api.php`,
  `backend/docs/openapi.json`, `backend/docs/STAYS.md`, `backend/docs/PAYMENTS.md`.
- Buy Rent Sell reference: `src/App.tsx`, `src/pages/Properties/ApproveListings.tsx`,
  `src/pages/Users.tsx`, `src/pages/Favorites.tsx`, `src/pages/Reports.tsx`,
  `src/pages/Analytics.tsx`, `src/components/ProtectedRoute.tsx`.
- Stay reference: `routes/web.php`, `app/Models/Room.php`,
  `app/Http/Controllers/BookingController.php`,
  `app/Http/Controllers/UserController.php`,
  `app/Http/Controllers/BlogController.php`.

## Incremental update: rich stay content and public discovery

The subsequent stay catalogue feature completes group 13's marketing content:
stay/room descriptions, photo upload/removal galleries, amenities, rules and
independent publication controls. Group 17 is now **partial**: SDA public list and
detail pages exist, while customer authentication, dated public availability and
reservation remain pending. The checklist therefore moves to **11 local-ready,
3 partial and 7 pending/unverified**, with the same limits on interpreting counts
as overall effort or project completion. Native app readiness remains unverified.

Verification for this feature: 464 API tests (2,323 assertions), 193 frontend
unit/integration tests, production build and format checks, 50 desktop/mobile
browser tests and 5 real-service journeys passed. Synthetic DB and marketing/private
file backup/restore checks passed (four uploaded files verified). All changes remain in
SDA. No reference data migration, environment publication or staging/deployment.

The next work item is separate customer authentication and ownership mapping,
followed by the customer booking journey; public catalogue views never reuse staff
credentials or introduce a staff booking fallback.

## Incremental update: customer identity and owned booking reads

Separate customer signup/login, profile/password changes, per-device logout and
read-only owned booking list/detail are implemented in SDA web/API. Historical
bookings are not claimed by email; empty new-account booking lists are expected
until trusted reservation/migration ownership is delivered. Group 16 moves from
pending to **partial**: email verification/recovery and other account lifecycle
work remain. Checklist is now **11 local-ready, 4 partial and 6 pending/unverified**,
not an effort/time completion percentage. Public reservation creation and native
clients remain pending. See [customer scope and tests](CUSTOMERS.md).

Customer account verification: 471 API tests (2,395 assertions), 201 frontend
unit/integration tests, production build and format checks, and 56 desktop/mobile
browser tests passed. All six real
Laravel/MariaDB browser journeys and synthetic DB/upload recovery checks passed.
The frontend additionally verifies customer-only session expiry and rejection of
unexpected logout responses; historical booking ownership is covered by explicit
synthetic API fixtures, not a production backfill.

## Customer reservation update — 4 November 2026

Group 17 now has locally tested catalogue, customer dated availability, reviewed
reservation and owned booking detail, sharing staff inventory and exact prices.
No online payment is collected. Group 17 moves from partial to local-ready for this
scope: **12 local-ready, 3 partial, 6 pending/unverified** groups. These are checklist
counts, not an effort or time percentage. Account verification/recovery, online
payments, customer cancellation, moderation, extended guest onboarding and native
Android/iOS verification remain. No staging or production deployment is authorized.
See [reservation rules](RESERVATIONS.md).

Validation for this update: 482 API tests (2476 assertions), 208 frontend
unit/integration tests, 60 desktop/mobile browser checks and seven real API browser
journeys passed. TypeScript/production build, changed-file formatting, skills
validation, OpenAPI references and regenerated Postman artifacts passed. Synthetic
acceptance database and four uploaded files were backed up/restored with row-count
and SHA-256 checks. Local development received only the pending additive actor
migration; no staging or deployment occurred. Both reference repositories stayed clean.

## Customer account lifecycle update — 4 November 2026

Email verification, explicit single-use confirmation and password recovery are
implemented locally with private mail capture. Password reset revokes customer
sessions and pending links; new reservations require verified email. Native client
integration, email-change verification, deletion and live SMTP deliverability remain
unverified. Group 16 remains partial: **12 local-ready, 3 partial, 6 pending/unverified**
groups; these are checklist counts, not completion/time percentages. No staging
or deployment occurred. See [recovery rules](CUSTOMER_RECOVERY.md).

Validation for this lifecycle update: 498 API tests (2567 assertions), 214 frontend
unit/integration tests, 64 desktop/mobile browser checks and eight real API browser
journeys passed. Production build/typecheck, changed-file PHP/web formatting,
skills validation and all 81 OpenAPI/Postman operations passed. The isolated
synthetic database (including account-action rows) and four upload files were
backed up/restored with row-count and SHA-256 verification. Only the pending
additive migration was applied locally; both reference repositories stayed clean.
