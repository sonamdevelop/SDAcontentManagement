# Stay occupancy and cash reports

`GET /api/v1/admin/stays/{id}/report?from=2030-01-02&to=2030-01-04`

Staff web: `/staff/stay-reports`. Select a stay and 1–62 nights. `from` is
inclusive and `to` is exclusive, matching booking dates. Years 1000–9998 are
supported. Required stay, booking list/detail and payment ledger permissions and
`stays:read`/`bookings:read` token abilities are checked on every request. Existing
capabilities apply; no new ability or migration is required. Both stay ownership
scope and booking own/group/global scope apply independently. Missing/out-of-scope
stays return 404; role/ability failures return 403. Customer tokens cannot access
staff reports. Responses are no-store and omit all guest/contact, notes, payment
reference and hash fields.

## Reservation and value semantics

Only currently confirmed, visible bookings overlapping the window contribute.
Check-out dates never consume a night. Early attendance departure does not shorten
reserved dates or charges. Cancelled bookings are excluded even when cancelled
after the reporting window: these are current records, not an as-of-history report.
Daily booked room counts and their sum (booked room-nights) compare with **current
inventory across all active/inactive room types**. Inventory room-nights is current
inventory × civil nights. Inactive stays/rooms remain reportable. No historical
inventory snapshot exists. Above-current-capacity values are shown without clamping;
zero capacity has no percentage. A restricted staff booking scope can omit other
reservations, so these are visible booked/capacity ratios, never actual occupancy
or attendance measurements. Nightly meters have text equivalents.

Booked value uses each booking's nightly rate snapshot × rooms × nights within
the range, grouped by the booking currency, with exact SQL decimal arithmetic.
The current room rate and total booking amount do not replace the nightly snapshot.
This is neither collected cash nor recognized revenue/tax reporting. No currency
conversion or cross-currency total is provided.

## Cash movement semantics

This independent series includes visible bookings of any status and any stay
dates. Ledger entries are selected by their recording timestamp in the selected
stay's timezone, converting calendar boundaries to application storage timezone.
DST midnight skips use the shared ReportPeriod boundary implementation. Receipts
include payments and opening advances; refunds are separate. A reversal subtracts
from its original entry's category **on the reversal recording day**. Prior-period
entries reversed in this period can therefore produce negative receipts/refunds.
Unlike current balance reports, historical cash periods are not rewritten by
future corrections. Net movement is receipts minus refunds, using exact decimals
and frontend BigInt; monetary JSON values remain strings. This records offline
events only; no money is moved. Imported opening advances would represent their
ledger recording date, not independently verified historical cash timing.

The endpoint aggregates records before returning daily counts (at most 62 rows)
and per-currency totals. No booking identities or individual payment records are
returned. Filters survive reload; stale requests are aborted and response context,
contiguous dates, totals and decimal values are validated before displaying data.

Historical capacity, recognized revenue, tax invoices, gateway settlement,
booking/room-specific report drilldowns and stay CSV exports remain future work.
No staging/deployment or reference-repository modifications are part of this feature.
