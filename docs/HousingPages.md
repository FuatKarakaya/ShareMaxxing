# Housing pages (WBS-18.2)

Depends on WBS-18.1 API and the shared layout/content adapters in the forum pages branch (WBS-19.2). Each WBS task has its own feature commit and PR. Merge the backend/layout/forum dependencies first; this branch includes them for a runnable review.

Routes: /barinma (district/type filters, pagination and own-listings toggle), /barinma/yeni (create), /barinma/:id (detail/contact, owner close/reopen/delete controls), /barinma/:id/duzenle (owner edit). The own list includes closed/hidden records with clear labels; general browsing follows backend visibility rules. Contact information renders only from the poster's optional field, as escaped text, never inferred from account email. Delete needs explicit confirmation. Loading, empty, API-error and retry states are distinct. The backend enforces all permissions even for direct API calls.

Uses features/content/session.ts and StudentSignIn from forum pages: JWT in memory only, login via existing /auth/login; refresh requires re-login. This small adapter can be replaced by the future shared authentication screens. There is no registration/verification UI in this work package.

Run backend separately with migrated local database and a verified sample account, then frontend npm ci / npm run dev and open /barinma. Checks: npm run lint, npm run typecheck, npm test, npm run build. HTTP-boundary UI tests exercise combined filters/pagination, create/edit/contact clearing, close/reopen, delete confirmation/cancel, owner restrictions, escaped content and retry. Manual browser/phone visual review remains; the layout uses shared responsive grids/forms and 44px controls.
