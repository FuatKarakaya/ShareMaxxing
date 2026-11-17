# Forum API (WBS-19.1)

Every endpoint requires the shared verified ACTIVE account middleware and returns Cache-Control: no-store. IDs are UUIDs. Errors use {error:{code,message}} with 400 invalid input, 401 missing/invalid token, 403 inactive/unverified or non-owner mutation, 404 absent/inaccessible content.

| Method/path | Contract |
|---|---|
| GET /api/forum/categories | {categories:[{id,code,labelTr}]} migration-owned lookup |
| GET /api/forum/questions | Optional categoryId, page 1..9999; {questions,page,hasMore}, 20/page, newest first with ID tie-break. Hidden questions omitted. |
| GET /api/forum/questions/mine | Same filters, author's questions including hidden. |
| GET /api/forum/questions/:id | {question,answers,page,hasMore}; optional page paginates answers 20/page, oldest first with ID tie-break. Hidden content only for its author or staff. |
| POST /api/forum/questions | title (1..180), body (1..6000), categoryId; 201 {question}. |
| POST /api/forum/questions/:id/answers | body (1..6000); parent must be QUESTION, 201 {answer}. |
| PATCH /api/forum/posts/:id | Author only: nonempty subset title/body/categoryId for questions, body only for answers; {post}. |
| DELETE /api/forum/posts/:id | Author only, 204; question cascades answers and solves all affected active moderation cases atomically. |

Unknown fields, immutable parent/kind injection, invalid categories and answer-to-answer are rejected. Post fields: id, authorId, kind, parentPostId, categoryId, title, body, hiddenAt, createdAt, updatedAt, author:{id,displayName}, category:{id,code,labelTr}|null. Never serialize private author email/password fields. Parent row locks serialize answer creation/edit/deletion with question deletion.

## Notification and moderation boundaries

A new answer creates one FORUM_REPLY in-app notification for the question author in the same transaction; self replies skip notification. Payload contains a display-safe message and internal question/answer links. Email is an injectable createForumRouter(sendEmail) integration called after commit; absent/failed delivery is logged and never rolls back the answer. Actual delivery/retries are WBS-22.2, and are not claimed implemented here. The sender receives {questionId,answerId,recipientId}; it can use the existing account service privately.

After each save the post is checked by the AI in the background (WBS-24.1, see [AiFlagging.md](AiFlagging.md)). Unsuitable posts and failed checks get a moderation case; content is never hidden or declared safe by the AI. Keyword search is documented in [ForumSearch.md](ForumSearch.md) (WBS-21.1). Votes and course-code tags remain separate tasks.

Verify from backend/: npm test; npm run build:code. Integration tests cover permissions, validation, category browsing, answer shape, notifications, email failure, hidden visibility, ownership, cascade/moderation lifecycle and pagination.
