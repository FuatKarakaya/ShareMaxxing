# AI content flagging — WBS-24.1

New and edited forum posts (questions and answers) and room listings are
checked by the AI model. Unsuitable content gets a case in the moderation
queue. The code is in `backend/src/content/review.ts` and uses the provider
client from [AiProvider.md](AiProvider.md).

There is no new endpoint. The forum and housing endpoints work as before.

## What happens after a save

1. The post or listing is saved and published. The user gets the answer right
   away and does not wait for the AI.
2. In the background, the title and text are sent to the AI model. The author,
   the e-mail address and the contact details are not sent.
3. The model answers whether the text is unsuitable, how sure it is (0 to 1)
   and a one-sentence reason in Turkish.

| Result | What is stored |
|---|---|
| Suitable | Nothing |
| Unsuitable | A `moderation_cases` row with `source = AI`, `status = ACTIVE`, the reason, `ai_model` and `ai_score` |
| No usable answer | A `moderation_cases` row with `source = AI`, `status = ACTIVE`, `ai_unavailable = true` and reason `AI_UNAVAILABLE` |

"No usable answer" covers a timeout, a quota error, any other provider error,
an answer that is not the expected JSON, the daily usage limit and a missing
API key. In all of these the content stays published and a human looks at it.
It is never treated as safe.

## Rules

- The AI only adds cases. It never hides content and never warns or suspends a
  user. Only a moderator or admin can do that (WBS-25.1).
- If the content was edited or deleted while the AI was checking it, the result
  is dropped. An edit starts its own check.
- A post or listing has at most one open AI case.
- Without `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL`, every new post and
  listing goes to the queue as "AI unavailable".

## For the moderation queue (WBS-25.1)

AI cases use the same table as user reports. `source = AI` with
`ai_unavailable = false` is a real AI flag; show `reason` and `ai_score`.
`ai_unavailable = true` means the AI could not check the content.

## Tests

`backend/tests/ai-flagging.test.ts` replaces the provider and checks, through
the real forum and housing endpoints:

- an unsuitable listing gets an AI case, stays published and its author stays
  active;
- a suitable question gets no case; answers are checked too;
- a timeout, a malformed answer, a quota error, a provider error and a missing
  key each keep the content and create an "AI unavailable" case;
- the daily limit works the same way without calling the provider;
- a result for edited or deleted content is dropped, and an open AI case is
  not opened twice.

The check runs inside the server process. If the server restarts in the few
seconds between a save and the AI answer, that one check is lost.
