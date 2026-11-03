# Staff stays and room bookings

This first phase manages room-type inventory in SDA. The original Stay in Dandeli
repository remains read-only: no customer accounts, bookings, uploaded identity
proofs or payment records have been imported. There is no public booking or online
payment endpoint. Exclusive property sale/rent deals remain a separate workflow.

Apply the additive migration with `php artisan migrate` (never migrate:fresh or
krayin-crm:install). Log in again for `stays:read`, `stays:write`, `bookings:read`
and `bookings:write` token abilities. Custom roles need the permissions below;
all-permission roles still obey own/group/global visibility, including empty
groups. New stays belong to the actor; no client owner reassignment is accepted.

All endpoints are after `/api/v1`, use staff bearer authentication and return
`Cache-Control: no-store`. Successful creates return 201; reads/updates return
200, validation 422, out-of-scope/missing 404, absent token 401, ACL/ability 403,
and conflicting request ID 409.

| Method | Path | Permission | Ability |
|---|---|---|---|
| GET | `/admin/stays` | `stays` | `stays:read` |
| POST | `/admin/stays` | `stays` + `stays.manage` | `stays:write` |
| PUT | `/admin/stays/{id}` | `stays` + `stays.manage` | `stays:write` |
| POST | `/admin/stays/{stayId}/rooms` | `stays` + `stays.manage` | `stays:write` |
| PUT | `/admin/stays/{stayId}/rooms/{id}` | `stays` + `stays.manage` | `stays:write` |
| GET | `/admin/stay-rooms/{id}/availability` | `stays` | `stays:read` |
| GET | `/admin/stay-bookings` | `stay-bookings` | `bookings:read` |
| GET | `/admin/stay-bookings/{id}` | `stay-bookings.view` | `bookings:read` |
| POST | `/admin/stay-bookings` | `stay-bookings.create` + `stay-bookings.view` + `stays` | `bookings:write` + `stays:read` |
| PATCH | `/admin/stay-bookings/{id}/cancel` | `stay-bookings.cancel` + `stay-bookings.view` | `bookings:write` |

Stay payload: `name` (255), `city` (100), valid IANA `timezone` (e.g.
`Asia/Kolkata`) and boolean `active`. Room payload: `name` (255), `inventory`
(1–1000), `capacity` per room (1–100), positive decimal-string `nightly_rate`, and
boolean `active`. PUT supplies the complete editable fields. Stays list embeds
room types, with page/per_page (1–100) pagination. No delete endpoint exists.
Timezone is immutable once room types exist. Rates/names may change without
rewriting existing booking snapshots. Inventory/capacity changes are rejected while
current or future confirmed bookings exist. Inactive stays/rooms accept no new
bookings and report zero available inventory; existing history/cancellation stays
accessible.

Availability requires `check_in=YYYY-MM-DD&check_out=YYYY-MM-DD`. Dates are calendar
dates in the stay's timezone, with check-in inclusive and checkout exclusive.
Stays last 1–365 nights. Check-in cannot be before the local date. Daylight-saving
changes do not add/remove nights. The response contains nights, capacity,
nightly_rate, currency, timezone and available_rooms for the entire range, using
peak concurrent occupancy. Adjacent bookings can use the same room inventory on
the checkout date. Availability is advisory; save locks and rechecks inventory.

Booking payload:

```json
{
  "request_id": "0d59a581-8794-4980-a88c-5bdd03ef6cee",
  "room_type_id": 2,
  "check_in": "2030-01-01",
  "check_out": "2030-01-03",
  "rooms": 2,
  "guests": 4,
  "guest_name": "Guest name",
  "guest_email": "guest@example.test",
  "guest_phone": "+91 9000000000",
  "expected_rate": "1000.25",
  "advance": "100.01",
  "payment_reference": "Offline receipt",
  "notes": "Internal booking notes"
}
```

Guest email/phone, reference (190) and notes (5000) are optional. Guest name is
required, maximum 150. Guest count must fit rooms × room capacity. expected_rate
must match the current nightly rate; a changed rate returns 422 and requires a
fresh availability quote. Total = rate × rooms × nights, calculated in integer
cents without floats, maximum 9999999999999.99. Money inputs must be decimal
strings, not JSON numbers, negatives or scientific notation. Advance defaults to
zero and cannot exceed total. Balance is total less recorded advance. The app's
configured currency (local setup INR) is snapshotted server-side. Prices in this
phase are a flat per-room nightly total; extra beds, tax breakdowns, seasonal rates,
packages and discounts are not modelled.

Bookings are confirmed immediately and hold inventory. There is no temporary
hold/expiry, room-number assignment, editing, extra payment,
refund accounting or online collection in this phase. The guest is a booking
snapshot rather than a migrated customer login or CRM lead. Owner, creator,
status, rates, total and balance cannot be overridden by client fields.

Retry an uncertain create with the identical UUID and payload. An equivalent
retry by the same creator returns 200 with the original booking, even if it was
cancelled or the rate changed. Reusing its key for different data/creator returns
409 (scope still applies). A fresh booking after cancellation requires a new key.
Source locks and a unique request ID serialize real concurrent requests, including
cross-room request ID collisions; booking and history commit atomically.

Cancel before the local check-in date with
`{"cancellation_reason":"Plans changed"}` (required, maximum 1000). This releases
inventory, retains advance/reference/history, and performs no money movement.
Repeated cancellation is a no-op preserving the original reason/timestamp/event.
On or after check-in, cancellation is closed; historical bookings cannot be
rewritten. Cancelled bookings cannot be reopened.

Lists support status, room_type_id, page/per_page, newest first. They omit guest
identity/contact, notes, request IDs, references, cancellation reasons and history.
Details include private snapshots and chronological booking/attendance events.
Internal payload hashes are never returned. Room/stay records and assigned owners
cannot be hard-deleted while referenced, retaining financial history.

## Guest check-in and check-out

Confirmed bookings now expose `checked_in_at`, `checked_out_at` and derived
`attendance_status` (`not_arrived`, `checked_in`, `checked_out`). Booking financial
status remains confirmed; attendance is tracked independently. Existing bookings
start with no attendance recorded. Lists accept the attendance_status filter,
independently of status/room_type_id filters, without exposing guest details.

PATCH `/admin/stay-bookings/{id}/check-in` requires `stay-bookings.check-in` plus
`stay-bookings.view` and the `bookings:write` ability. Arrival can be recorded only
on/after check_in and before check_out, using the booking's snapshotted timezone.
PATCH `/admin/stay-bookings/{id}/check-out` requires `stay-bookings.check-out` plus
`stay-bookings.view` and `bookings:write`. Departure requires a recorded arrival;
it may be recorded early or after the scheduled departure. Both use an empty body,
server timestamps and the authenticated actor. Cancelled bookings reject both.
Source/booking visibility still applies; inactive stay/room setup does not prevent
recording an existing guest's attendance. No new login token abilities are needed.

Repeated actions return the current detail without changing the original timestamp
or adding another event, even when replaying check-in after recorded check-out.
Check-in/out, cancellation and inventory writes use the same source lock order.
The timestamp and audit event commit or roll back together. Clients cannot supply
backdated timestamps or another staff actor. There is no reopen, undo, backdate,
no-show or partial-room attendance operation; these actions cover the whole booking.

Early checkout preserves original dates, inventory allocation, total, advance and
balance. It neither resells the remaining nights nor performs a refund. Checked-in
bookings cannot be cancelled. Staff screens review each action, display timestamps
in the stay timezone, and offer Refresh booking. An uncertain response can safely
retry the same action; it must not be treated as proof of failure.

## Staff workspace and verification

Use `/staff/stays` for stays/room types and `/staff/stay-bookings` for bookings.
The booking form checks availability, shows an exact quote and locks an uncertain
submission for retry with its original UUID. Pending requests stay in component
memory only; inspect existing bookings before creating another if you reload or
leave an uncertain form. Cancellation requires review and a reason. Refresh loads
the authoritative server record. Permission checks remain server-side.

`bash tools/test-api.sh` includes stay date/money/ACL/inventory/replay tests and
real two-process competing/identical booking tests on `krayin_test` with array
cache. The concurrency tests retain uniquely named synthetic fixtures in that
isolated database. Frontend checks are `npm test`, `npm run build` and the normal
Playwright browser suite. `tools/test-browser-acceptance.sh` also exercises real
stay/room setup, exact booking, exhausted availability and cancellation/release
against its separate new synthetic database, then includes stay tables in the
backup/restore checks. No normal development database is refreshed or reset.
