# Customer reservations

Authenticated customers can quote a published room and create a confirmed reservation
at `/account/reserve?room_type_id=ID`. Public room cards link to this flow. Review shows
exact dates, quantities, nightly rate and total before confirmation. No online money
is collected: advance is zero, the outstanding balance is the full total, and no
ledger receipt is created. Staff continue attendance, cancellation and offline finance.

GET `/api/v1/customer/rooms/{id}/availability?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD`
requires customer:bookings. POST `/api/v1/customer/bookings` requires that ability and
customer:bookings:create; accounts signed in before this release must sign in again.
The create throttle is five requests per minute per IP. Send request_id (UUID),
room_type_id, check_in/out, rooms, guests, guest_name, optional guest_phone and the
quoted expected_rate. Dates use the stay timezone, checkout excluded, 1–365 nights.
Only active published rooms with active published parents accept new reservations.
Quotes do not hold inventory. Creation locks the same source/inventory rows as staff,
rechecks occupancy and capacity, and calculates exact integer cents on the server.

Fresh creation returns 201; same customer/key/normalized payload returns 200 with
the current owned booking. A changed payload, another customer or staff request key
returns 409. Replay remains valid after rates, profile, publication or cancellation
change. Server derives customer ownership and stay scope; monetary/owner/status
payload overrides are prohibited. Guest email is snapshotted from the account.
History has customer_created/customer_actor_id and null staff actor/created_by.

The web client keeps the review and UUID for uncertain network/server outcomes,
including subsequent retry throttles. Retry the same request. A definitive initial
validation failure requires a fresh quote. Pending review is memory-only: after
leaving/reloading check My bookings before creating again. Customer and staff tokens
remain separate; no staff fallback exists.

Unit/integration tests cover exact totals, protected fields, ownership, replays,
rollback, old-token rejection and throttling. Real two-process races cover customer
versus customer and customer versus staff on the last room. Browser tests cover
review, uncertain retry, sold-out dates and the real reservation/owned-detail/staff
history flow. Customer cancellation, online payments and
native clients remain separate work. This feature does not establish production readiness.

Customer email verification and password recovery are implemented. New reservations require verified email; existing owned reads and exact request replay remain available. See [account recovery and mail configuration](CUSTOMER_RECOVERY.md). Live SMTP delivery remains a deployment-time check.
