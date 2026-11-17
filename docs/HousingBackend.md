# Housing API (WBS-18.1)

All routes require an ACTIVE, email-verified account via Authorization: Bearer <accessToken>. Responses are no-store. IDs are UUIDs. Errors use the shared {error:{code,message}} envelope. No schema changes are required.

| Method/path | Contract |
|---|---|
| GET /api/housing/districts | {districts:[{id,name}]} from migration-owned lookup data |
| GET /api/housing | Optional districtId, listingType (HAVE_ROOM/NEED_ROOM), page (1..9999). Returns {listings,page,hasMore}, newest first with ID tie-break, 20 rows/page. Only ACTIVE, non-hidden listings. |
| GET /api/housing/mine | Same filters; includes the caller's closed/hidden listings. |
| GET /api/housing/:id | {listing}; closed/hidden records are available only to the author or staff. |
| POST /api/housing | Required districtId, listingType, title (1..160), description (1..6000); optional contactDetails (null or 1..250). Returns 201 {listing}. |
| PATCH /api/housing/:id | Nonempty subset of create fields plus status ACTIVE/CLOSED. Only author. |
| DELETE /api/housing/:id | Author only, 204. Resolves active moderation cases and deletes in one transaction. |

Listings return id, authorId, districtId, listingType, title, description, contactDetails, status, hiddenAt, createdAt, updatedAt, author:{id,displayName}, district:{id,name}. No private account email/password fields. Contact details come only from the poster's field. Unknown fields, invalid lookups/UUIDs, malformed filters and overlong/blank content return 400. Auth failures return 401/403, non-owner writes 403, missing/inaccessible records 404. Edit/delete operations lock the listing row before authorization/mutation.

## Integration boundaries

After each save the listing is checked by the AI in the background (WBS-24.1, see [AiFlagging.md](AiFlagging.md)). Unsuitable listings and failed checks get a moderation case for human review; content stays visible and is never labelled safe. No external AI call is made inside the request or transaction.

## Verify

From backend/: npm test and npm run build:code. The housing integration suite covers live-account authorization, ownership (including admin non-owner rejection), validation, lookup filters, pagination, close/reopen, hidden visibility, privacy and transactional moderation cleanup.
