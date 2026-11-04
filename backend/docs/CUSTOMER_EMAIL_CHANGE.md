# Customer email change

Customer account navigation: `/account/email`. Public explicit confirmation:
`/account/change-email#email=…&token=…&customer_id=…`.

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/customer/email-change` | Own pending `new_email`/`expires_at`, otherwise null. |
| `POST /api/v1/customer/email-change` | `new_email` + `current_password`; 202 after local/configured mail dispatch. |
| `DELETE /api/v1/customer/email-change` | Password-confirmed idempotent cancellation; 204. |
| `POST /api/v1/customer/auth/change-email` | Public explicit link confirmation with `customer_id`, `email`, `token`; 204. |

Authenticated routes use the existing `customer:account` ability and active
customer identity, without a staff/cookie fallback. Request/cancel share five
attempts/minute/IP. Password uses existing 72 UTF-8 byte validation. The request
checks password before reporting address availability. Current/used addresses
return the same `new_email` validation error. Pending status is token-free and
scoped to the current customer. All responses are no-store. No schema migration:
the existing account-action table supports a separate `change-email` purpose.

## Request, replace and cancel

The server trims/normalizes the target email. One pending change exists per
customer. A persisted one-minute cooldown applies to replacements, including
recently cancelled/completed requests. Requests generate 32 random bytes, mail a
private fragment link to the **new** address, and store only a SHA-256 digest bound
to the original normalized sign-in email and purpose. Links expire after 60 minutes.
The old email, verification state, tokens, password and ownership do not change
until confirmation. A new successful request invalidates the previous link.

Customer row locks serialize issuance/cancellation with login/password/reset and
other account work. Caller token ownership/ability/expiry are checked again after
taking the lock. Synchronous mail failure rolls back the replacement, retaining
the previous pending link, and returns a generic 503 without mail diagnostics.
SMTP delivery itself is external to database transactions; a message sent before
a later database failure can contain an unusable link and the client should retry.
Cancellation consumes only the email-change purpose; other account actions and
sessions survive. Cancellation does not reset the send cooldown.

## Explicit confirmation and identity

Opening the link never confirms it. The frontend consumes fragment values into
memory and removes them from the visible URL before an API call. It displays the
target email and consequences, then requires an explicit confirmation button.
The public POST sends no stored bearer/cookies. The server locks the original
customer and rejects absent/inactive accounts, incorrect account/target/token,
consumed, cancelled, replaced or expired links, and a changed source email with
the same 422 `errors.token` outcome. Digests use constant-time comparison.

Target uniqueness is checked again and enforced by the existing unique database
index. A target claimed after issue is rejected; a competing uniqueness failure
rolls back as an invalid link. Success atomically changes email, marks the new
email verified, removes every token for that customer and consumes all outstanding
verify/reset/email-change links. Replays return an invalid-link response.

The customer ID and password remain the same. Existing booking/favourite ownership
continues by ID; matching-email guest bookings are never auto-claimed. Historical
booking guest email snapshots stay unchanged. Separate staff and other-customer
records/tokens are unaffected. The browser clears its local customer login after
successful confirmation and asks for sign-in with the new address; staff storage
is preserved. An error keeps local session state for retry. A fresh sign-in issued
after completion uses the new email. Already-authorized in-flight work cannot be
undone by token revocation.

## Testing and limits

Unit/API checks cover hash/link binding, normalization, curation, wrong identities,
expiry, replacement/cancellation, single use, ownership preservation, target claims,
password-change invalidation, delivery rollback, stale callers and rate limits.
Browser tests cover confirmation/fragment privacy and account-token separation.
Real acceptance captures mail locally, confirms the link, probes revoked devices,
checks old-email login rejection/new verified login with the same customer ID, and
replays the used link without revoking the new session. No real customer email is
sent by these tests. Existing isolated DB/upload backup/restore checks also run.

This is not account deletion, MFA, a full email-change audit/history or an old-email
notification service. Existing mail configuration remains the delivery mechanism;
production SMTP deliverability is still unverified. No staging/deployment or
reference repository changes are included.
