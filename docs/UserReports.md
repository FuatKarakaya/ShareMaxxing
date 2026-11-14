# User reports (WBS-17.1)

Send `POST /api/reports` with a verified account's Bearer token and JSON fields
`targetType` (`USER`, `TRIP`, `HOUSING` or `POST`), `targetId` (UUID) and
`reason` (1–1000 characters after trimming).

The API creates an active user report in the moderation queue. It returns
`201 { "report": { "id": "...", "status": "ACTIVE" } }`. Invalid input returns
400, missing or hidden targets return 404 and an existing active report from
the same reporter for the same target returns 409.

In Forum and Barınma, open a detail page while signed in to report content or
its author. The trip details page is tracked separately in PR #37. Connect its
report buttons to the same API when the page reaches main.
