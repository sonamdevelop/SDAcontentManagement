# Customer device sessions

Web: `/account/sessions`, linked from customer account navigation.

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/customer/sessions` | Paginated active own sessions (`page`, `per_page` 1–100; default 20). |
| `DELETE /api/v1/customer/sessions/{id}` | Password-confirmed removal of one other own session. |
| `DELETE /api/v1/customer/sessions/others` | Password-confirmed removal of all other own sessions, including expired/not displayed rows. |

All routes require an active **customer** bearer token with `customer:account`.
Existing customer tokens already have this ability; no new capability/sign-in is
required. Staff tokens and cookie sessions cannot stand in for the customer.
Responses are no-store. No database migration is needed.

## Metadata and boundaries

Rows contain only `id`, `device_name`, `created_at`, nullable `last_used_at`,
nullable `expires_at`, and boolean `is_current`. Current session is first, then
newest session ID. Device labels come from sign-in and can repeat or be misleading;
there is no physical-device verification, IP/location tracking or device fingerprint.
The effective expiry is the earlier of token expiry and a configured positive
Sanctum lifetime. Exactly expired tokens are inactive. Null means no scheduled
expiry when neither constraint exists. New account sign-ins still issue 30-day
tokens under the existing policy. Listing updates the current last-used timestamp
through normal customer authentication. No plaintext bearer, hash, ability list,
account foreign keys or other people's/staff metadata is serialized.

Both DELETE actions require JSON `{ "current_password": "…" }`, using the existing
password UTF-8 byte/length validation. Wrong password returns 422. Both share five
attempts/minute/IP, including invalid passwords, separate from password-change
limits. Revoking the current ID returns 422 `errors.session`; use the existing
account sign-out action. Unknown/foreign/already-revoked numeric target IDs all
return the same 204, so repeating a successful DELETE is safe and does not reveal
another account's session existence. Invalid/overflow IDs return 404. Browser
accepts only a confirmed 204 before reporting success.

Revocations run within a transaction holding the customer row lock used by login
and password-change/reset flows. After taking the lock, the caller token's current
ownership, effective expiry and account ability are checked again; queued work
from a revoked caller is rejected. All-other excludes the current token. Separate
customer and staff identities are always scoped through the customer's token
relation. Current customer/staff sessions, passwords, pending action links,
bookings and saved properties are not changed.

Revocation blocks subsequent requests with the removed token. It cannot undo work
already authorized by another endpoint before revocation. A sign-in serialized
after revocation can issue a fresh token. If account compromise is suspected,
change the password as well (existing flow revokes all customer sessions). This
is session management, not MFA, device trust or a historical access audit.

## Browser behavior

The screen shows active session cards, current-device marker, timestamps,
pagination/refresh and a separate confirmation form. Other-device actions require
an explicit confirmation and password; the current card has no revoke button.
Password input is discarded on submit, including failed attempts. Failed/uncertain
requests retain the confirmation and allow retry; they do not claim success or
clear either session. Successful actions refresh the list. A customer 401 clears
only the customer session. Device metadata is React-escaped text. No password or
session list is written to browser persistent storage.

Unit/API tests cover effective expiry/strict boundaries, metadata curation,
account/type/ability separation, pagination, password/retry, current preservation,
all-other revocation, stale caller validation, invalid IDs and rate limits. Web
checks cover confirmation/retry, wrong response/data rejection and independent
session expiry. Real-service acceptance creates three customer sign-ins, revokes
one and then all others, probes removed/surviving tokens against the actual API,
and confirms staff access still works. Tests use synthetic isolated data only.

Email-change verification/deletion, MFA, live mail delivery, native device builds
and legacy account linking remain separate work. No staging/deployment or outbound
communications are part of this feature; reference repositories remain read-only.
