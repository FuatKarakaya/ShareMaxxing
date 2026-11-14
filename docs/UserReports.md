# User reports (WBS-17.1)

Send `POST /api/reports` with a verified account's Bearer token and JSON fields
`targetType` (`USER`, `TRIP`, `HOUSING` or `POST`), `targetId` (UUID) and
`reason` (1–1000 characters after trimming).

The API creates an active user report in the moderation queue. It returns
`201 { "report": { "id": "...", "status": "ACTIVE" } }`. Invalid input returns
400, missing or hidden targets return 404 and an existing active report from
the same reporter for the same target returns 409.

Sign in with a verified account and open a forum question, room listing or trip
detail to report the item or its author. A forum answer has its own report button.
The form can be cancelled before submission.
