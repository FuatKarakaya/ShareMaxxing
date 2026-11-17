# AI forum search — WBS-23.2 *(optional)*

Students can search the forum with a question in their own words (FR-37,
UC-16). The search returns related questions with a link to each. It uses the
AI provider client from [AiProvider.md](AiProvider.md).

## How it works

1. After a question or answer is saved or edited, its text is turned into an
   embedding vector in the background and stored in `forum_post_embeddings`.
   Deleting a post deletes its vector.
2. A search turns the query into a vector and compares it with the stored
   ones. Posts that are close enough are returned, grouped by question, best
   first, at most 5. An answer that matches leads to its question.
3. Hidden posts, and answers of hidden questions, are never returned.

Every result is an existing post with a link to it. When nothing is close
enough, the list is empty and the page offers keyword search (NFR-11).

## Endpoint

`GET /api/forum/ai-search?q=<question>` (logged-in, verified users)

```json
{
  "results": [
    {
      "questionId": "…",
      "title": "Yemekhane cumartesi açık mı?",
      "excerpt": "Cumartesi günleri öğlen açık.",
      "matchedAnswer": true,
      "score": 0.83,
      "link": "/forum/…"
    }
  ]
}
```

| Status | Code | When |
|---|---|---|
| 400 | `INVALID_INPUT` | `q` is missing, blank, longer than 300 characters or given twice |
| 503 | `AI_SEARCH_UNAVAILABLE` | The provider failed, the daily limit is reached or AI search is not set up; use keyword search |

## Settings

Besides `AI_BASE_URL` and `AI_API_KEY`:

| Variable | Meaning |
|---|---|
| `AI_EMBEDDING_MODEL` | Embedding model of the provider. Without it AI search is off |
| `AI_SEARCH_MIN_SCORE` | How close a post must be, between 0 and 1. Default `0.6` |

The provider must offer the OpenAI-compatible embeddings API. Google Gemini
does (for example `gemini-embedding-001`); Groq does not. The closeness scale
depends on the model, so check `AI_SEARCH_MIN_SCORE` with a few sample
questions after choosing one.

Searches and indexing count towards `AI_DAILY_LIMIT`.

## Indexing existing posts

Posts written before AI search was set up, or while the provider was down,
have no vector. From `backend/`:

```sh
npm run forum:index
```

It indexes every post without an up-to-date vector of the current model and
can be run again at any time.

## Limits

- Every search compares the query with all stored vectors in the server. That
  is fast for a student forum of a few thousand posts, not for much more.
- Vectors are stored as plain arrays, so no database extension is needed.
- A post edited while it is being indexed is indexed again by the edit itself.

## Tests

`backend/tests/ai-forum-search.test.ts` uses fake embeddings and checks
indexing on save and edit, removal on delete, answer matches leading to their
question, hidden posts, the empty result, the "unavailable" answer and input
checks.

## Search box — WBS-23.3

The forum list page (`/forum`) has a box "Sorunu kendi cümlelerinle sor" above
the keyword search. The results link to their questions; an answer match is
marked "Bir yanıtta". When nothing related is found, or AI search is
unavailable, the box says so and offers `Anahtar kelimeyle ara`, which runs the
normal keyword search with the same words.

Code: `frontend/src/features/forum/AiSearchBox.tsx`; tests:
`frontend/tests/ai-search.test.tsx`.
