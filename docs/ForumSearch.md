# Forum keyword search (WBS-21.1)

The forum list supports `q` on GET `/api/forum/questions` and `/api/forum/questions/mine`.
A trimmed, case-insensitive literal substring matches a question title, question body,
or a non-hidden reply body. Reply matches return their parent question once.
Hidden questions remain excluded from the public list; the existing mine view includes
only the caller's questions, including their hidden questions. Hidden replies never
contribute search matches. Existing authentication and display-safe author fields apply.

`q` is optional, at most 200 characters, and must be a single string. Empty/whitespace
queries browse normally. `%`, `_`, and backslash are literal characters. Matching uses
PostgreSQL case folding (database locale), with no stemming or accent normalization.
This substring search does not use the existing full-text GIN index; evaluate a trigram
index if measured production volume makes scans expensive. No migration is required.

Category and mine filters combine with search. The URL stores the query, so refresh,
back/forward, and copied links retain it. Submit with Enter or Ara; Aramayi temizle clears
only search. Changing search or filters resets page 1; pagination retains all filters.
Results keep the existing newest-first ordering and 20-question pages.

Validation: backend `npm test`; frontend `npm run lint`, `npm run typecheck`, `npm test`,
and `npm run build`. Automated coverage includes literal escaping, hidden content,
reply matching, category filtering, validation, pagination, and search/clear UI behavior.
