# Notification bell — WBS-22.3

Implements the in-app notification bell and expandable notification list inside the shared navigation menu (`Navigation.tsx`):

- **`NotificationBell` (`frontend/src/features/notifications/NotificationBell.tsx`)**:
  - Hidden when the visitor is not signed in.
  - When signed in, displays the `Bildirimler` button with a live unread count badge (`<span aria-label="{unreadCount} okunmamış bildirim">`) when `unreadCount > 0`.
  - Automatically loads notifications on `/` and fetches fresh notifications whenever the bell panel is opened.
  - Lists notifications with formatted timestamp (`Europe/Istanbul`), unread `Yeni` marker, escaped display text, optional internal navigation link (`İlgili sayfaya git`), single-item `Okundu işaretle` action (`POST /api/notifications/:id/read`), and `Tümünü okundu işaretle` action (`POST /api/notifications/read-all`).
  - Handles loading (`Yükleniyor…`), empty (`Henüz bildiriminiz yok.`), and API failure + retry (`Tekrar dene`) states.

## Verification

Run from `frontend/`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Interaction tests in `frontend/tests/notifications.test.tsx` mock `fetch` at the HTTP boundary and verify logged-out hiding, home-page badge count rendering, opening the panel and following internal links, marking single and all notifications as read, empty state, and error recovery.
