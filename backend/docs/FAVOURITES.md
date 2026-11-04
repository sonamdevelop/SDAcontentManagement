# Customer saved properties and staff popularity

Public property detail offers Save property to authenticated customers; anonymous
visitors see a customer sign-in link. My saved properties lives at
`/account/favourites`. Saving/removal is explicit and reversible. The customer
client sends only the independent customer bearer on private requests, while
public catalogue/detail calls remain anonymous. Staff tokens never substitute.

New customer sessions include customer:favourites. Existing customers must sign
in again for this ability; the web offers a customer-only reauthentication action.
Email verification is not required for favourites. No legacy favourites were
imported or linked by email. Saved property records are stored on the server;
there is no persistent browser cache of listing/profile data.

| Method | Path after /api/v1 | Capability |
|---|---|---|
| GET | `/customer/favourites` | customer:favourites |
| GET | `/customer/favourites/{id}` | customer:favourites |
| PUT | `/customer/favourites/{id}` | customer:favourites |
| DELETE | `/customer/favourites/{id}` | customer:favourites |
| GET | `/admin/property-favourites` | properties + properties:read |

PUT creates one membership for the authenticated customer/property and returns
200 with property_id/saved:true. It accepts no owner or state overrides. New saves
require an approved, published, available listing from an active agent. Repeating
the same PUT preserves the membership's original timestamp and order, including
a replay after the source becomes hidden. Property/customer/owner locks and a
unique customer/property index protect concurrent saves. DELETE removes only the
caller's membership and returns 204 even when already absent or the ID is unknown.
The save/remove limiter is shared 30 attempts per minute per IP.

GET status returns only own property_id/saved, without source details/existence
signals for unsaved IDs. Owned list order is newest membership first, page and
per_page (default12/max50). Rows contain property_id, saved_at and property. The
property is a current PublicProperty DTO only when it passes all current catalogue
visibility rules. A single joined query keeps visibility and selected data together.
Unpublished, pending/rejected, reserved/sold/unavailable or inactive-agent sources
return property:null. The UI shows a generic unavailable card with removal;
it never exposes a new private title, price, image, address or owner contact.
Deleting a property cascades its memberships. There is no historical listing
snapshot in the favourites table and no restored access to hidden listings.

The web keeps the requested save/remove intent while a response is uncertain,
including a subsequent throttled retry. It repeats PUT or DELETE rather than
blindly inverting state. Explicit refresh reads current server state. Definitive
errors are displayed; expired/wrong-ability sessions can sign in again without
clearing staff storage. Page filters/pagination survive URL navigation.

Staff use `/staff/property-favourites` for aggregate popularity. Endpoint filters
are property_id, min_count (default1), page and per_page (default20/max100). Counts
include memberships from active customer accounts; own/group/global property
scope is applied independently. Order is saved count descending, property ID
descending. Rows expose scoped inventory title/city/business/moderation state,
publication flag and count, without customer IDs/names/emails, owner contacts or
individual save timestamps. Counts represent customer accounts, not unique people,
booking revenue or sales conversions. No public popularity counter was added.

All private successes are no-store. Wrong account type/token is 401, absent
ability/inactive account/role 403, ineligible new save 404, invalid fields 422 and
rate limit 429. Apply additive 2026_11_04_000005 migration without resetting data.
No outbound notifications, paid actions, staging/deployment or native clients
were enabled. Unit/API tests cover redaction, ownership, retries, timestamps,
pagination, source visibility, cascade removal, scope/counts and throttling;
two real worker races verify same/different-customer concurrent saves. Responsive
and real browser journeys cover save retry, unavailable removal and staff refresh.
