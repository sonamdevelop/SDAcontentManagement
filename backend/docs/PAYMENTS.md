# Staff stay booking offline payment ledger

This ledger records payments and refunds already handled outside SDA. It neither
moves money nor verifies a bank/card/UPI receipt. There is no gateway, automatic
refund, invoice/tax breakdown, cancellation-fee policy or payment-proof upload in
this phase. Work remains entirely in SDA; neither reference app/data is modified.

## Original advances and immutable history

The additive migration creates `stay_payments` and imports each positive original
booking advance as one `opening_advance` entry. It preserves its amount, original
reference, actor and creation timestamp. The method is `unspecified` because the
old booking did not record a method. Original booking `advance`, `total`, currency
and payment_reference fields remain unchanged. New bookings create their opening
entry in the same transaction as the booking; zero advances need no entry.

Ledger entries cannot be edited or deleted through the app. Corrections append
one `reversal` linked to the original entry and require a reason. Record a new,
correct payment/refund separately after reversing the mistaken one. Opening
advances can be reversed without rewriting their historical booking snapshot.
An entry can be reversed only once; a reversal cannot itself be reversed. If a
refund depends on a receipt, reverse the refund first before reversing a receipt
that would otherwise leave negative net payment. Reversing a refund after a
replacement payment is also rejected if it would exceed the agreed total.

Every manual entry has a method (`cash`, `upi`, `bank_transfer`, `card`, `other`),
optional reference (190 characters), actor/time and optional payment note/reason
(1000). Refunds and reversals require a nonblank reason. Amounts are positive
decimal strings with at most 13 integer digits and two decimal places, maximum
9999999999999.99; JSON numbers, negatives and scientific notation are rejected.
Currency, booking, actor, kind and reversal amount/method/reference are derived
server-side. Clients cannot backdate entries or assign another staff actor.

## Exact financial totals

All calculations use integer cents. Totals exclude reversed original entries;
reversal rows remain visible in history but are not counted again as money moves.

- `received_total`: effective opening advance plus effective additional payments.
- `refunded_total`: effective recorded refunds.
- `net_paid`: received_total minus refunded_total, between zero and agreed total.
- `amount_due`: agreed total for confirmed bookings; zero for cancelled bookings.
- `balance`: outstanding amount, max(amount_due minus net_paid, zero).
- `refund_due`: max(net_paid minus amount_due, zero), for cancelled bookings.

Effective gross received/refunded totals must also fit the supported monetary
range. New payments are accepted only for confirmed bookings and cannot exceed
outstanding balance. Refund records cannot exceed net_paid. A confirmed-booking
refund increases its outstanding balance. After cancellation, no new payment can
be recorded, outstanding is zero, and the net recorded amount is shown as refund
due. Cancellation itself creates no refund entry. Actual settlement/refund remains
an offline staff responsibility. Check-in/out does not alter any financial total.

Booking summary/detail responses now include these six derived fields. The old
`advance` is a historical snapshot rather than the current paid amount; clients
must use net_paid/balance for current settlement. List responses contain financial
totals only, without ledger references/reasons, guest contacts or internal hashes.

## API and permissions

All paths follow `/api/v1`, require bearer authentication and obey the booking's
own/group/global visibility. All responses use `Cache-Control: no-store`.
`stay-bookings.view` is required for every ledger route. Reads also require
`stay-bookings.payments` and `bookings:read`; writes additionally require
`bookings:write` plus the action permission. Existing tokens already containing
bookings read/write abilities can be reused after role permissions are assigned.

| Method | Path | Extra action permission |
|---|---|---|
| GET | `/admin/stay-bookings/{id}/payments` | None |
| POST | `/admin/stay-bookings/{id}/payments` | `stay-bookings.payments.create` |
| POST | `/admin/stay-bookings/{id}/refunds` | `stay-bookings.payments.refund` |
| POST | `/admin/stay-bookings/{id}/payments/{entryId}/reverse` | `stay-bookings.payments.reverse` |

Payments/refunds use:

```json
{
  "request_id": "76120d02-3dd6-47cf-933b-1ebca49f607f",
  "amount": "500.49",
  "method": "upi",
  "reference": "Offline receipt reference",
  "reason": "Recorded after offline collection"
}
```

Reversals use `request_id` and `reason` only. List pagination supports page and
per_page (1–100), newest entry ID first. Responses include a `summary` containing
all six derived totals plus booking total, original advance, currency and status.
Write responses contain a single `data` entry; list responses contain a paginated
data array with meta/links. Entries include reversal_of/reversed_by IDs so both
original and correction remain traceable. Internal payload hashes/request IDs are
not exposed in ledger rows. Booking history also records the financial action,
entry ID, amount and actor/time; full references/reasons require ledger access.

A required client UUID prevents duplicate entries. Retry an uncertain write with
the same endpoint, UUID and payload. The same creator receives 200 with the
existing entry; a new entry returns 201. Changed payload, booking/action/target or
creator with that UUID returns 409. Replays return current financial totals even
if the booking was later cancelled/refunded or the original entry was reversed.
Current permissions and scope are rechecked. There is no second financial action
on a replay. Invalid limits/correction order return 422, out-of-scope/missing
records 404, permission/ability denial 403 and missing/revoked authentication 401.

All financial writes lock stay, room, booking and current ledger rows in the same
order as cancellation/attendance. Totals are rechecked against current locking
reads, including after waiting for another transaction. Entry and audit event
commit/roll back together; unique UUIDs and reversal links protect retries and
corrections across simultaneous requests. Successful writes return the summary
calculated in their transaction, rather than a later unrelated state.

## Staff workspace and checks

Booking details show a dedicated Payment ledger panel, current totals and
paginated immutable history. Record payment/refund and correction buttons follow
role permissions. Each entry requires explicit review. Uncertain writes lock the
draft and preserve its UUID, including across Refresh ledger; replays stay
available even when the refreshed balance is now zero. Navigating away/reloading
loses that in-memory request, so inspect history before creating a replacement.
No pending financial request or staff token is added to localStorage.

Run `bash tools/test-api.sh` for exact money, migration/opening behavior, immutable
history, cancellation/refund, scoped permissions, duplicate requests, rollback,
pagination and real two-process receipt/refund/reversal tests on krayin_test.
Frontend unit/integration and desktop/mobile browser checks cover review, draft
retention, role restrictions and the refresh-after-uncertain-save case. The real
browser acceptance runner uses a separate new synthetic database and also tests
receipt, refund, reversal, cancellation and final refund, then verifies a database
backup/restore including stay_payments. No normal database is reset or deleted.

## Stay payment follow-up

GET `/admin/stays/{id}/payment-follow-ups?view=collection` requires `stays`,
`stay-bookings`, `stay-bookings.view` and `stay-bookings.payments` permissions,
plus `stays:read` and `bookings:read` token abilities. Stay and booking visibility
apply independently, including own/group/global scopes. No new migration or token
ability is needed. Inactive stays and existing room types remain accessible.

`collection` (default) lists positive outstanding balances; `refund` lists positive
refund-due balances. Totals follow the immutable ledger: opening advances and
payments minus refunds, excluding reversed entries and reversal rows. Cancelled
bookings owe zero; their retained net payments appear as refund due. Settled
bookings disappear after refresh. These are current balances across all booking
dates, not historical revenue or a date-based cash report. No money moves here.

Rows are ordered by scheduled check-in then booking ID, with page/per_page
(default 20, maximum 100). Context contains stay ID/name, view, as_of and booking
counts for both queues from one read transaction. Exact decimal strings retain
each booking's currency; currencies are never added together. Curated fields are
booking/room IDs, guest/room names, dates, status, currency, net_paid, amount_due,
balance and refund_due. Contacts, notes, payment references and hashes are omitted.

Open **Payment follow-up** at `/staff/stay-payment-follow-ups`, select a stay,
switch queues and refresh after recording an offline payment/refund through the
existing booking detail. Stay/view/page filters persist in the URL. Navigation
and requests require all four permissions. Responses use no-store. Invalid view
or pagination returns 422; denied permissions/abilities 403, out-of-scope stay
404 and absent authentication 401.

## Printable booking statement

GET `/admin/stay-bookings/{id}/statement` requires `stay-bookings.view` and
`stay-bookings.payments` ACL plus `bookings:read`. Existing own/group/global
booking scope applies. No new permission, token ability or migration is needed.
Inactive source inventory and cancelled bookings retain readable statements.
Unauthenticated returns 401, missing rights/ability 403 and missing/out-of-scope
booking 404. Responses use `Cache-Control: no-store`.

The response data contains generated_at, curated booking snapshots, the current
financial summary and **all** ledger entries in ascending ID order, without
pagination or truncation. Booking/ledger locks give one consistent snapshot with
existing financial writes. Money remains decimal strings in the booking currency.
Corrections link reversal_of/reversed_by and explicitly mark effective entries;
reversed originals and reversal rows remain visible but do not add to totals.
Original advance is already part of the ledger, not another charge or receipt.
Cancelled bookings owe zero and retain any refund due until recorded refunds.

Fields exclude guest email/phone, internal notes, payment references/reasons,
staff identities, request IDs and payload hashes. This is an offline account
statement, not a tax invoice, payment collection or gateway receipt verification.
It is generated on demand; it is not a stored/issued immutable document.

Use **Open printable statement** on booking detail's payment ledger, then
**Print statement** for the browser print dialog / Save as PDF. Refresh statement
reads current balances again. The print layout hides staff navigation, account
controls and buttons, and retains booking, summary and complete history. Browser
printing can add its own headers/footers; adjust those in the print dialog.
Statements require staff authentication; there is no public share link.
