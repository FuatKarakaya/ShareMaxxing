// Shared AI provider client (WBS-23.1), see docs/AiProvider.md.
// It talks to any OpenAI-compatible API, so the provider is chosen with
// environment variables and can be changed without touching the code.

export type AiFailure =
  | 'NOT_CONFIGURED'
  | 'LIMIT_REACHED'
  | 'TIMEOUT'
  | 'QUOTA'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE';

// Every way the provider can fail ends here. Callers must treat it as
// "no answer", never as "the content is fine".
export class AiUnavailableError extends Error {
  constructor(public reason: AiFailure) {
    super(`AI provider unavailable: ${reason}`);
  }
}

export type ChatMessage = { role: 'system' | 'user'; content: string };

function positiveInteger(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function settings(modelVariable: 'AI_MODEL' | 'AI_EMBEDDING_MODEL' = 'AI_MODEL') {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/+$/, '');
  const apiKey = process.env.AI_API_KEY;
  const model = process.env[modelVariable];
  if (!baseUrl || !apiKey || !model) throw new AiUnavailableError('NOT_CONFIGURED');
  return {
    baseUrl,
    apiKey,
    model,
    timeoutMs: positiveInteger(process.env.AI_TIMEOUT_MS, 10_000),
    dailyLimit: positiveInteger(process.env.AI_DAILY_LIMIT, 200),
  };
}

// Usage limit: at most AI_DAILY_LIMIT requests per UTC day. The count is kept
// in memory, so it starts again when the server restarts.
let usage = { day: '', count: 0 };

function countRequest(dailyLimit: number): void {
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) usage = { day, count: 0 };
  if (usage.count >= dailyLimit) throw new AiUnavailableError('LIMIT_REACHED');
  usage.count += 1;
}

export function resetAiUsage(): void {
  usage = { day: '', count: 0 };
}

// Sends one request to the provider and returns the response body.
async function send(config: ReturnType<typeof settings>, path: string, payload: object): Promise<string> {
  countRequest(config.dailyLimit);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, ...payload }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (response.status === 429) throw new AiUnavailableError('QUOTA');
    if (!response.ok) throw new AiUnavailableError('PROVIDER_ERROR');
    return await response.text();
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    const timedOut = (error as { name?: string } | null)?.name === 'TimeoutError';
    throw new AiUnavailableError(timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR');
  }
}

// Sends the messages and returns the JSON object in the model's answer.
// The prompt must ask for a JSON object.
export async function chatJson(messages: ChatMessage[]): Promise<{ model: string; data: unknown }> {
  const config = settings();
  const body = await send(config, '/chat/completions', { messages });
  try {
    const answer = JSON.parse(body) as { choices: { message: { content: unknown } }[] };
    const text = answer.choices[0].message.content;
    if (typeof text !== 'string') throw new Error('No text answer.');
    // Some models wrap the object in a code block or a sentence.
    const data: unknown = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return { model: config.model, data };
  } catch {
    throw new AiUnavailableError('INVALID_RESPONSE');
  }
}

// Turns each text into an embedding vector with AI_EMBEDDING_MODEL (optional
// AI forum search, WBS-23.2). The provider must offer the embeddings API.
export async function embed(texts: string[]): Promise<{ model: string; vectors: number[][] }> {
  const config = settings('AI_EMBEDDING_MODEL');
  const body = await send(config, '/embeddings', { input: texts });
  try {
    const answer = JSON.parse(body) as { data: { index: number; embedding: unknown }[] };
    const vectors: number[][] = [];
    for (const item of answer.data) {
      const vector = item.embedding;
      if (!Array.isArray(vector) || !vector.length || !vector.every(value => typeof value === 'number' && Number.isFinite(value))) {
        throw new Error('Not a vector.');
      }
      vectors[item.index] = vector;
    }
    if (vectors.length !== texts.length || vectors.some(vector => !vector)) throw new Error('Missing vectors.');
    return { model: config.model, vectors };
  } catch {
    throw new AiUnavailableError('INVALID_RESPONSE');
  }
}
