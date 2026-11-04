# Customer accounts and owned booking reads

Apply additive migration `2026_11_03_000004_create_stay_customer_accounts`.
It creates separate stay_customers and adds a nullable restrictive customer_id
foreign key/index to stay_bookings. It does not alter staff accounts, creator
attribution, guest snapshots, financial records or automatically link any booking.
Existing bookings remain unlinked. No database reset or reseed is needed.

| Method | Path after /api/v1 | Authentication / ability |
|---|---|---|
| POST | `/customer/auth/register` | Anonymous |
| POST | `/customer/auth/login` | Anonymous |
| GET | `/customer/me` | Customer bearer / customer:account |
| PATCH | `/customer/me` | Customer bearer / customer:account |
| POST | `/customer/password` | Customer bearer / customer:account |
| POST | `/customer/auth/logout` | Customer bearer / customer:account |
| GET | `/customer/bookings` | Customer bearer / customer:bookings |
| GET | `/customer/bookings/{id}` | Customer bearer / customer:bookings |

## Identity, passwords and sessions

Register with name (150), email (255), password and password_confirmation;
phone (30) and device_name (100) are optional. Email is trimmed/lowercased and
unique in the customer table. New passwords require 12+ characters, upper/lower
letters and a number, at most 72 UTF-8 bytes and no null characters. The byte
limit prevents bcrypt truncation. Passwords are hashed server-side. Customer
registration cannot set staff IDs/roles/permissions or disable its new account.
Email is currently unverified and is not evidence of ownership of legacy data.

Register/login return 201 with data.access_token, Bearer token_type and expires_at
(30 days). Invalid/inactive login returns generic 401. Registration validates
uniqueness, including a racing duplicate. Signup is limited to 5 attempts/minute/IP;
login to 5/minute/IP+normalized email plus 20/minute/IP; password changes to
5/minute/IP. The existing 120/minute API throttle also applies. Laravel's middleware
priority means password throttling is deliberately independent of an auth resolver.

CustomerAccess checks tokenable customer type, expiration (including Sanctum's
configured maximum age), active account and required ability on every request.
There is no staff guard/session-cookie fallback. Staff tokens cannot call customer
endpoints, and customer tokens cannot call staff APIs, even with wildcard abilities.
No core auth configuration/provider or Firebase bridge was changed. Inactive
accounts return 403 for existing tokens and cannot log in.

GET me returns only id/name/email/phone. PATCH requires name and replaces the
optional phone (omission clears it). Email is immutable here; extra status,
password, role and ownership fields are ignored. Profile edits do not rewrite
historic guest snapshots. All customer responses, including errors, use no-store.
401 means absent/invalid/expired/revoked/wrong token type; 403 means inactive or
missing ability; invalid fields/filters return 422 and limits return 429.

Change password with current_password, password and password_confirmation. New
password must differ. A successful 204 hashes the new password and revokes all
customer tokens atomically. Login verification/token issuance locks the same row,
so a stale password cannot issue a token across a completed password change.
Staff tokens remain intact. Logout 204 revokes only the current customer token.

## Ownership and booking privacy

Only explicit stay_bookings.customer_id = authenticated customer ID grants read
access. Neither guest email/phone/name, a matching staff ID, a query parameter nor
a client-submitted customer_id establishes ownership. Matching-email foreign and
unlinked bookings both return 404. Inactive/unpublished inventory does not hide an
already owned historical booking. No customer listing endpoint exposes other
customers. No customer or account deletion endpoint exists in this phase.

Booking lists accept status (confirmed/cancelled), page and per_page (1–100,
default 20), newest ID first. Responses include data and meta page/total fields.
They expose curated booking/guest names, scheduled dates/timezone, quantities,
attendance, booked rate/total/advance/currency and canonical exact ledger totals.
They omit guest contacts, bank references, internal notes/cancellation reasons,
staff/customer ownership IDs, request IDs, hashes and staff history events.
Cancelled bookings owe zero and retain any refund due. Read transactions keep
booking/ledger snapshots consistent; detail uses the booking/ledger lock order.

Customer reservations now assign explicit ownership from the authenticated customer.
No historical backfill or customer claiming/linking endpoint is implemented. Staff
creation still ignores customer_id input. Customer reservations use nullable staff
created_by and an explicit customer_actor_id audit event; no staff actor is invented.
Customer payment writes remain unavailable; cancellation requests now have a staff review workflow. See [reservation rules](RESERVATIONS.md).

## SDA web client

Use **My account** at `/account` for signup/login/profile, `/account/password` for
password changes and `/account/bookings` / `/account/bookings/:id` for owned reads.
Customer tokens use sda.customer.token in per-tab sessionStorage (memory-only if
storage is unavailable); staff tokens retain their separate key. Passwords/profile
records are not stored there. Public catalogue calls send neither token/cookies.
A customer 401 returns the active session to login without clearing staff state;
a late response from an old customer session cannot clear a newer customer token.

Logout waits for server confirmation and retains the session for retry after an
uncertain network response. A confirmed password change clears the customer
session and requests sign-in again. Web forms display server validation errors,
booking filters/pages persist in the URL, and customer pages expose no staff
attendance/payment controls. Responsive browser tests do not establish native
Android/iOS readiness.

## Deliberate remaining work

Email-change verification and live SMTP delivery checks,
customer account deletion, verified legacy
booking linking and Firebase/native-client migration remain pending. No outbound
email/SMS/push delivery or live data migration was enabled. Do not describe this
step as a complete customer booking product or a production launch.

The isolated API suite covers registration/normalization, password strength/byte
limits, hashing, duplicate accounts, independent model/token types, expiry,
inactive users, abilities, password all-session revocation versus one-session
logout, curated ownership reads, pagination and matching-email non-ownership.
Positive owned-booking fixtures are synthetic and explicitly server-linked;
no customer binding was written into development/reference data.
The sixth real-service browser journey registers a new synthetic customer,
updates its profile, reads an empty owned list, changes password, proves the old
token was revoked and then signs out while the existing staff session survives.
Synthetic backup/restore checks now include stay_customers.

Customer email verification and password recovery are implemented. New reservations require verified email; existing owned reads and exact request replay remain available. See [account recovery and mail configuration](CUSTOMER_RECOVERY.md). Live SMTP delivery remains a deployment-time check.

Customer cancellation requests and staff approve/reject review are available, with complete history and no automatic refunds. See [cancellation rules](CANCELLATIONS.md).

Customer saved properties and scoped staff popularity are available. Hidden/unreviewed listings show an unavailable placeholder without current private details. Older customer sessions must sign in again for customer:favourites. See [saved-property rules](FAVOURITES.md).

Customer active-device session listing and password-confirmed individual/all-other revocation are available. Current customer and staff sessions remain separate. See [session management](CUSTOMER_SESSIONS.md).
