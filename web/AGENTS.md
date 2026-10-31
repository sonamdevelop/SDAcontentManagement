# SDA web frontend

- Implement and commit changes only in SDAcontentManagement. The two source repos
  in SOURCE_PROVENANCE.json remain read-only; do not modify, commit or push there.
- Public pages call only the documented Laravel public endpoints. Never import
  Firebase credentials, SQL dumps, source Git metadata or customer uploads.
- Every feature requires meaningful unit/integration coverage. Use `npm test`,
  `npm run build` and relevant `npm run test:browser` checks; keep fixture data in tests.
- Preserve exact money display, URL filters, consent, private-field boundaries and
  enquiry UUID reuse for uncertain retries. Never add a private/admin fallback.
- Stay/room bookings, staff authentication and mobile migration are separate phases.
