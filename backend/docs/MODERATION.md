# Property publication moderation

Property moderation lists scoped pending/approved/rejected listings, with property
ID filters and pagination. Open Review listing and history to inspect current
public fields/photos, revision and historical snapshots. Moderators choose approve
or reject, enter a reason and explicitly confirm the exact revision. Property
readers have no decision controls; editors can resubmit rejected content with a
note, or edit public content to start a fresh pending review.

New properties start pending, including when is_published is true. Public catalogue,
detail and enquiry submission require approved moderation AND is_published,
available business status and an active owner/agent. Publication and enquiry
switches retain their existing purpose. Approval is a quality review, not a deal
reservation or money transaction. A moderator may review their own listing if
their role grants the permission; separation of duties is not enforced.

Review permission is properties.moderate plus properties, with the separate
properties:moderate token ability. Existing staff sessions must sign out/in for
this new ability. Editors retain properties.edit/properties:write; readers need
properties/properties:read. Own/group/global property scope applies to queue,
detail, resubmission and decisions. No customer token or staff session fallback.

| Method | Path after /api/v1 | Required capability |
|---|---|---|
| GET | `/admin/property-moderation` | properties + properties:read |
| GET | `/admin/properties/{id}/moderation` | properties + properties:read |
| PATCH | `/admin/properties/{id}/moderation` | properties.moderate + properties + properties:moderate |
| POST | `/admin/properties/{id}/moderation/submit` | properties.edit + properties + properties:write |

Queue status defaults pending; optional property_id/page/per_page (20 default,
100 max). Results order by property ID descending. Detail includes listing,
moderation_status/revision/reason/moderated_at, publication/enquiry flags and
chronological history. History records revision, action, actor, reason, timestamp
and a public-content snapshot. It excludes private addresses, owner names/phones,
private uploads and tokens. Legacy records may have a null snapshot/actor.
Successful private responses are no-store; wrong scope is 404, missing
permission/ability 403, invalid fields 422 and revision/state conflicts 409.

Decision body is expected_revision, decision (approved/rejected) and reason
(required, max1000). Property-row locking serializes edits and decisions. Exact
same terminal decision/reason on the same revision returns 200 without duplicate
events; a changed decision/reason or stale revision returns 409. Decisions are
immutable per revision. Use the publication toggle to unpublish urgently, or edit
public content to start a new review. No automatic approval override is provided.

Public fields that reset approval are title, description, purpose, type, price,
rent period, area/unit, bedrooms/bathrooms, city/state and photo set/order. Cast
money/quantity normalization avoids false changes (1200 and 1200.00 match).
Private owner/address fields, publication/enquiry switches and deal-managed
business status do not reset review. Direct property writes cannot assign
moderation state, actor or revision. An edit resets pending, clears the current
review reason/actor/time, increments revision and retains earlier audit snapshots.

Resubmit body is expected_revision and reason (required max1000). Only rejected
content can be resubmitted without editing. It increments revision and becomes
pending. Same actor/note/expected revision safely replays for that new revision,
including after subsequent approval, until content advances again. Matching is
case-sensitive independently of database collation. Different payload/actor or
later content returns 409. The web freezes action and revision for uncertain
retries; stale/definitive failures require explicit refresh before a new action.

Apply additive 2026_11_04_000004 migration, never reset/reseed. Existing published
properties retain approved state via explicit legacy_approved history with null
actor; this records upgrade compatibility, not a human review. Existing unpublished
properties remain pending. Property deletion preserves audit rows/snapshots with a
null live FK and immutable original property reference. Removed photo files still
follow existing deletion policy; historical URLs do not archive old media bytes.
Public-storage photo URLs remain public if known; moderation controls catalogue
and enquiry access, not an authenticated media gateway.

Tests cover default visibility/enquiry gating, revision conflicts, role/ability/
scope, resubmission, normalized/private versus public edits, upload rollback,
audit retention and real competing edit/approval worker races. Browser journeys
cover read-only review, uncertain retry, rejection/resubmission/approval and hiding
edited content until fresh approval. No staging, deployment, live email or native
client integration was enabled.
