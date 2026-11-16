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

function settings() {
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/+$/, '');
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
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

// Sends the messages and returns the JSON object in the model's answer.
// The prompt must ask for a JSON object.
export async function chatJson(messages: ChatMessage[]): Promise<{ model: string; data: unknown }> {
  const config = settings();
  countRequest(config.dailyLimit);

  let body: string;
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (response.status === 429) throw new AiUnavailableError('QUOTA');
    if (!response.ok) throw new AiUnavailableError('PROVIDER_ERROR');
    body = await response.text();
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    const timedOut = (error as { name?: string } | null)?.name === 'TimeoutError';
    throw new AiUnavailableError(timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR');
  }

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
