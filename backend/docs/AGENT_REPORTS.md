# Agent performance and CSV export

Staff use `/staff/agent-reports` for lead outcome and site-visit metrics, current
account activity flags and accessible outcome bars. Date bounds, report timezone,
agent ID and pagination persist in the URL. Refresh obtains a new snapshot.
Unavailable source modules show an unavailable message and no chart; permitted
zero counts remain zero. Only agents with matching permitted records appear.
The page is not a general staff/customer directory.

JSON remains GET `/api/v1/admin/reports/agents`. New CSV download is GET
`/api/v1/admin/reports/agents/export`. Both require property-reports AND
property-reports.agents plus reports:read. Leads independently require leads /
leads:read; visits require visits / visits:read. At least one source is required.
All-permission roles still obey own/group/global record scope and token abilities.
The optional user_id filter only narrows scope; outside/unknown IDs return no rows.
Inactive agents with matching history remain in the report with active:false.
Customer tokens cannot access these endpoints.

The report and overview now accept optional IANA timezone, defaulting to the
application timezone. from/to are inclusive calendar dates (1000–9998), each
optional, converted into the application's storage timezone for SQL comparisons.
Exclusive upper bound is the following requested local calendar date. DST changes,
skipped midnights and whole skipped days are covered; no global timezone setting
is modified. The response period.timezone records the requested interpretation.
as_of is one server snapshot timestamp; upcoming scheduled visits use that same
instant. The web forwards the displayed timezone explicitly on CSV export, even
when it was originally the organisation default.

Lead counts use created_at and current pipeline stage codes: open, won, lost,
unclassified. They follow current ownership, including reassignment. Visit counts
use scheduled starts_at and current scheduled/completed/cancelled/no_show status;
upcoming is a subset of scheduled, not an additional total bucket. This dashboard
does not calculate stay revenue, monetary sales totals or historical stage-change
counts. Existing metric semantics and source visibility are preserved.

CSV exports all filtered agents, ignoring pagination, ordered by user ID. The
query/materialized snapshot is completed before response streaming. An export
above 5,000 agents returns 422 with an export validation message before attachment
headers start; it is never silently truncated. Narrow dates or agent ID and retry.
An empty permitted report exports headers only. The export uses a fresh snapshot,
so it may differ from an earlier displayed page if records or ownership change.

CSV is UTF-8 with BOM, CRLF records and standard quoted/escaped cells. Base columns
are agent_id, agent_name, active, period_from, period_to, timezone, as_of. Permitted
lead columns are leads_total/open/won/lost/unclassified. Permitted visit columns
are visits_total/scheduled/completed/cancelled/no_show/upcoming. Unavailable source
columns are omitted. There are no emails, customer details, source record titles,
phone numbers, private notes or payment fields. Agent names beginning with formula
characters, control whitespace or Unicode whitespace plus a formula prefix are
prefixed with an apostrophe for spreadsheet safety. JSON display names are unchanged.

The authenticated staff client downloads only the fixed API export path, never a
resource-provided URL, with omitted cookies and redirect rejection. It validates
status, text/csv, attachment filename and a 10 MiB byte limit before offering the
file. Filters change/unmount aborts pending downloads; temporary object URLs are
revoked. Export failures remain visible without offering a JSON/HTML file as CSV.
Responses are no-store; filenames use the export's application-calendar date.
CORS already exposes Content-Disposition for allowed browser origins.

Unit/API tests cover CSV formulas and multiline quoting, permission/source/scope,
all-agent export versus pagination, row caps, private-data boundaries and UTC/DST
storage conversion. Responsive browser checks cover filters, unavailable sources
and downloads. A real journey creates a lead/visit through the application, filters
its current owner/timezone, downloads CSV and checks private contacts are absent.
No migration, outbound messages, staging or deployment are required by this step.
Stay occupancy/revenue analytics and broader report parity remain separate work.
