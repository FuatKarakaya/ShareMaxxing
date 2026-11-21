# Notification service and API — WBS-22.1

Implemented: shared in-app notification creation service (`createNotification`) and recipient endpoints (`GET /api/notifications/unread-count`, `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`).

Not in this part: connecting booking, cancellation, ride-end reminder, payment, and funding event producers (`WBS-22.2`, except `FORUM_REPLY` which already uses `createNotification`) and the frontend notification bell (`WBS-22.3`).

All HTTP endpoints require an `ACTIVE`, email-verified account (`Authorization: Bearer <token>`, see [AuthBackend.md](AuthBackend.md)) and return `Cache-Control: no-store`. Errors use `{ "error": { "code": "...", "message": "..." } }`.

## Internal service (`backend/src/notifications/service.ts`)

```ts
await createNotification(
  {
    recipientId,
    kind: 'BOOKING', // BOOKING | CANCELLATION | RIDE_REMINDER | PAYMENT | FUNDING | FORUM_REPLY | MODERATION
    text: 'Yolculuğunuz için yeni bir rezervasyon var.',
    link: `/yolculuklar/${tripId}`, // optional internal path starting with '/'
    metadata: { bookingId }, // optional primitive metadata (stored internally, not exposed on HTTP responses)
  },
  tx, // optional Prisma transaction client so notification commits atomically with the business event
);
```

### Validation & privacy rules (`databaseplan.md` §4.7 & §5.G)
- `recipientId` must be a valid UUID; because `createNotification` is an internal helper, it relies on the database foreign key (`notifications_recipient_id_fkey`) to reject non-existent user IDs.
- `kind` must be one of the 7 `NotificationKind` values.
- `text` must be 1..500 characters (trimmed).
- `link` (optional) must be an internal path starting with `/` (and not `//`), max 250 characters.
- For `kind: 'FUNDING'`, `metadata` is checked to block donor/recipient/driver/trip/route identifiers (`donorId`, `payerId`, `recipientId`, `driverId`, `tripId`, `originCity`, `destinationCity`, `originCityCode`, `destinationCityCode`, `email`, `displayName`), keeping askıda bilet notifications anonymous.
- Raw `payload` objects stored in the database are never returned on HTTP endpoints (`databaseplan.md` §5.G); only display-safe `text` and `link` fields are serialized.

## HTTP endpoints

| Method and path | What it does | Success |
|---|---|---|
| `GET /api/notifications/unread-count` | Returns caller's unread notification count | `200 { unreadCount }` |
| `GET /api/notifications?page=1&unreadOnly=true` | Lists caller's notifications (20/page, newest first); optional `page` (`1..9999`) and `unreadOnly` (`true`/`false`) | `200 { notifications, unreadCount, page, hasMore }` |
| `POST /api/notifications/:id/read` | Marks one of the caller's notifications as read (idempotent) | `200 { notification, unreadCount }` |
| `POST /api/notifications/read-all` | Marks all unread notifications of the caller as read | `200 { updatedCount, unreadCount: 0 }` |

### Notification response shape

```json
{
  "id": "…",
  "recipientId": "…",
  "kind": "FORUM_REPLY",
  "text": "Sorunuza yeni bir yanıt geldi.",
  "link": "/forum/...",
  "isRead": false,
  "readAt": null,
  "createdAt": "2026-11-16T18:00:00.000Z"
}
```

## Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid query parameter (`page`, `unreadOnly`, unknown query keys), invalid UUID `id`, or invalid service input / prohibited `FUNDING` metadata |
| 401 / 403 | see AuthBackend.md | Missing/invalid token, unverified email, or suspended user |
| 404 | `NOTIFICATION_NOT_FOUND` | No notification with that ID or notification belongs to another user |

Verify from `backend/`: `npm test` and `npm run build:code`.
