# Customer email verification and recovery

New and existing customer accounts start unverified. My profile shows the current
email verification state and a Send verification email button. No email is sent
implicitly during registration. Click the received link and explicitly confirm;
GET/link scanning does not mutate account state. Verified email is now required
for new reservations. Dated quotes, owned booking reads and exact previously
submitted UUID replay remain available to unverified accounts. No existing account
is silently marked verified or linked to historical bookings.

Forgot customer password links to `/account/forgot`. Recovery emails open
`/account/reset`; verification uses `/account/verify`. Email and a random 256-bit
token travel in the URL fragment, which the web screen removes immediately and
keeps only in memory. Links do not sign in, overwrite a staff session or mutate on
load. Reloading after fragment removal requires opening the email again. Server
calls use JSON POST without bearer tokens for completion/recovery, and only the
customer bearer for verification requests. Profile exposes email_verified_at.

| POST after /api/v1/customer | Fields | Success |
|---|---|---|
| `/email/verification` | Customer token; recipient comes from account | 202 |
| `/auth/verify-email` | email, token | 204 |
| `/auth/forgot-password` | email | 202 |
| `/auth/reset-password` | email, token, password, password_confirmation | 204 |

Recovery returns the same 202 body for unknown/inactive accounts and delivery
failure; it does not promise actual inbox delivery. Malformed email is 422.
Verification sending returns 503 on delivery failure. Completion uses a uniform
422 token error for expired, used, wrong-account, wrong-purpose and inactive links.
All responses are no-store. Recovery limits: 10/min/IP, 3/min/normalized email;
verification resend: 5/min/IP; verification/reset completion: shared 10/min/IP.
A persisted 60-second per-account/purpose cooldown survives multiple workers.

Tokens are stored only as SHA-256 hashes, bound to account, current email and
purpose, valid 60 minutes. Resending after cooldown rotates that purpose's token.
Customer-row and token-row locks serialize completion. Delivery is synchronous
inside the issuance transaction: failed delivery rolls back rotation, preserving
an older link. Reset atomically changes the password, revokes all customer sessions
and consumes all outstanding account links. Authenticated password changes also
consume outstanding links. Reset does not automatically verify email or sign in;
verification does not grant a login token. Staff credentials/sessions are separate.
No password, token or redirect is returned by these APIs. Email cannot be changed
through the profile form; use the separate [verified email-change flow](CUSTOMER_EMAIL_CHANGE.md).

Apply the additive `2026_11_04_000002_add_customer_account_actions` migration; never
reset/reseed. `PROPERTY_CUSTOMER_WEB_URL` must be the trusted frontend origin
(default http://localhost:5173), with HTTPS outside loopback; request Host, supplied
redirects, credentials, query strings and arbitrary paths cannot set email targets.
`PROPERTY_CUSTOMER_MAILER` defaults to `customer_log` for local work. Its private
0600 capture is `storage/logs/customer-actions.log` (override
PROPERTY_CUSTOMER_MAIL_LOG). It contains usable synthetic email links; keep it
out of Git and do not share it. Log transport is not real email delivery.

For a later approved deployment, configure `PROPERTY_CUSTOMER_MAILER=customer_smtp`
and standard MAIL_HOST/PORT/ENCRYPTION/USERNAME/PASSWORD/FROM_ADDRESS/FROM_NAME with
trusted credentials and TLS. This dedicated SMTP mailer verifies peer certificates
and does not inherit the CRM SMTP peer-verification override. Live delivery,
deliverability, DNS and production throttling still need deployment-time checks.
No live messages, staging or deployment were enabled by this feature.

Tests fake mail in isolated API cases and capture real rendered email in a unique
synthetic acceptance log/database for browser journeys. Capture helpers are local
test code; no token-preview or backdoor endpoint exists in the application.
