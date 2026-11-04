# Customer cancellation requests and staff decisions

Customers open My booking and enter a reason, review it and send a cancellation
request. The booking remains confirmed and inventory stays allocated until staff
approve. Rejected requests do not change the booking. Staff use Cancellation
requests to filter pending/approved/rejected/closed rows by booking ID, review the
customer reason and explicitly approve/reject with a customer-visible response.
Refresh owned booking detail to see complete request history and current balances.

POST `/api/v1/customer/bookings/{id}/cancellation-requests` accepts request_id UUID
and reason (required, max1000). It requires both customer:bookings and
customer:bookings:create, and explicit customer_id ownership. Email verification
is not required to request cancellation. Staff tokens cannot substitute; ownership
and decision overrides are prohibited. Five submissions/min/IP. There can be one
pending request per booking. Only confirmed unarrived bookings strictly before
the local scheduled arrival date accept new requests. A rejected request allows
a new UUID/reason; history is retained. Unpublished/inactive sources remain usable
for owned cancellation requests and exact replays.

Fresh request returns 201. Same owner/booking/trimmed reason/UUID returns the
current request with 200, including after approval, rejection, direct cancellation
or check-in. A changed payload/owner or second UUID while pending returns 409.
Pending web drafts preserve UUID/reason through uncertain failures and subsequent
throttles. After navigating/reloading, inspect booking history before starting
again; drafts are memory-only. Wrong ownership returns 404. No email-based claiming.

GET `/api/v1/admin/stay-cancellation-requests` requires stay-bookings +
stay-bookings.view and bookings:read. Query status defaults pending; optional
booking_id/page/per_page (default20/max100). Newest request first. Queue rows obey
booking own/group/global visibility and omit ownership IDs, UUID/hash, contacts,
internal notes and payment data. Customer-owned booking detail and staff booking
detail include curated chronological cancellation_requests. Staff booking event
history retains explicit customer/staff actors; no staff actor is invented.

PATCH `/api/v1/admin/stay-cancellation-requests/{id}/decision` accepts decision
approve/reject and decision_reason (required, max1000, visible to the customer).
Requires existing stay-bookings.cancel + stay-bookings.view and bookings:write,
plus normal booking/source scope. Review is mandatory in the web screen. Exact
same terminal decision and reason replays with 200 without duplicate history;
changed decisions/reasons return 409. Uncertain retry freezes the original choice.

Approval uses the existing staff cancellation transition and date/attendance
rules in one transaction. It cancels the booking, releases inventory and sets
amount due to zero while preserving total/advance and all receipts/refunds.
Any net paid becomes refund due; **no money is automatically refunded**. Rejection
keeps the booking confirmed. Direct staff cancellation or check-in closes a
pending request with a customer-visible explanation and a staff audit event.
A pending request that reaches arrival date cannot be approved; staff may reject
it or contact the customer. There is no scheduled automatic closure or financial
penalty computation. No outbound messages or payment provider was enabled.

Parent, room, booking and request locks serialize staff decisions and inventory
changes. Audit failure rolls back the booking, decision and all related events.
Apply additive migration 2026_11_04_000003; never reset/reseed existing data.
Unit/API tests cover eligibility, exact ledger/refund preservation, request and
decision retries, authority/ownership/scope, date restrictions, direct closure,
throttles and audit rollback. Two real worker races verify competing decisions
produce one terminal transition. Browser coverage includes customer/staff review,
uncertain retries, read-only permissions, filters and real rejection/re-request/
approval with availability and owned-balance checks. Native clients remain unverified.
