# AI provider setup — WBS-23.1

The backend reaches the AI model through one small client,
`backend/src/ai/provider.ts`. AI content flagging (WBS-24.1) uses it, and the
optional AI forum search (WBS-23.2) will use the same client and settings.

The client speaks the OpenAI-compatible chat API. Many providers with a free
plan offer it, so the provider is chosen with settings only. If a free plan
changes, we switch provider without changing code.

## Settings

| Variable | Needed | Meaning |
|---|---|---|
| `AI_BASE_URL` | yes | Address of the provider's OpenAI-compatible API |
| `AI_API_KEY` | yes | Secret key from the provider. Never commit it |
| `AI_MODEL` | yes | Model name from the provider's model list |
| `AI_DAILY_LIMIT` | no | Most requests per day, default `200` |
| `AI_TIMEOUT_MS` | no | Longest wait for one answer, default `10000` |

Locally the values go into `backend/.env`. On the live site they are entered
in the Render Dashboard (see [CloudSetup.md](CloudSetup.md)).

Two providers that have a free plan without a credit card:

| Provider | `AI_BASE_URL` | Example `AI_MODEL` | Key from |
|---|---|---|---|
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash` | <https://aistudio.google.com/apikey> |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | <https://console.groq.com/keys> |

Free plans allow only a limited number of requests per day, and the numbers
change. Check the limits page of the provider and keep `AI_DAILY_LIMIT` below
it.

## How it behaves

`chatJson(messages)` sends the messages and returns the JSON object from the
model's answer. When it cannot get one, it throws `AiUnavailableError` with one
of these reasons:

| Reason | When |
|---|---|
| `NOT_CONFIGURED` | One of the three needed settings is missing |
| `LIMIT_REACHED` | `AI_DAILY_LIMIT` requests were already sent today |
| `TIMEOUT` | No answer within `AI_TIMEOUT_MS` |
| `QUOTA` | The provider answered 429 (rate limit or used-up quota) |
| `PROVIDER_ERROR` | Any other error status, or the provider could not be reached |
| `INVALID_RESPONSE` | The answer is not the expected JSON |

Code that uses the client must treat every one of these as "no answer". It
must not treat the content as safe.

The daily count is kept in memory and starts again when the server restarts.
The provider's own quota still applies after a restart.

## Tests

`backend/tests/ai-provider.test.ts` replaces `fetch` and covers each reason
above, the request that is sent and the daily limit. No real provider is
called in the tests.
