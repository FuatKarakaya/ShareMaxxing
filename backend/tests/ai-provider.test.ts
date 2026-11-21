import { AiUnavailableError, chatJson, embed, resetAiUsage } from '../src/ai/provider';

const BASE_URL = 'https://ai.example.test/v1';
const messages = [{ role: 'user' as const, content: 'Reply with a JSON object.' }];

const fetchMock = jest.spyOn(globalThis, 'fetch');

function answer(content: unknown, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status });
}

async function failure(): Promise<string> {
  try {
    await chatJson(messages);
  } catch (error) {
    if (error instanceof AiUnavailableError) return error.reason;
    throw error;
  }
  throw new Error('chatJson did not fail.');
}

beforeEach(() => {
  process.env.AI_BASE_URL = `${BASE_URL}/`;
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  delete process.env.AI_TIMEOUT_MS;
  delete process.env.AI_DAILY_LIMIT;
  resetAiUsage();
  fetchMock.mockReset();
});

afterAll(() => {
  fetchMock.mockRestore();
  for (const name of ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL', 'AI_TIMEOUT_MS', 'AI_DAILY_LIMIT']) delete process.env[name];
});

test('without settings the provider is unavailable and nothing is sent', async () => {
  for (const name of ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL']) {
    const value = process.env[name];
    delete process.env[name];
    expect(await failure()).toBe('NOT_CONFIGURED');
    process.env[name] = value;
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

test('sends the model, the messages and the key, and returns the JSON object', async () => {
  fetchMock.mockResolvedValueOnce(answer('{"ok": true}'));
  expect(await chatJson(messages)).toEqual({ model: 'test-model', data: { ok: true } });

  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe(`${BASE_URL}/chat/completions`);
  expect(init?.method).toBe('POST');
  expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  expect(JSON.parse(String(init?.body))).toEqual({ model: 'test-model', messages });
});

test('reads a JSON object that the model wrapped in a code block', async () => {
  fetchMock.mockResolvedValueOnce(answer('```json\n{"ok": true}\n```'));
  expect((await chatJson(messages)).data).toEqual({ ok: true });
});

test('a rate limit or used-up quota is reported as QUOTA', async () => {
  fetchMock.mockResolvedValueOnce(answer('{}', 429));
  expect(await failure()).toBe('QUOTA');
});

test('a server error or a network error is reported as PROVIDER_ERROR', async () => {
  fetchMock.mockResolvedValueOnce(answer('{}', 500));
  expect(await failure()).toBe('PROVIDER_ERROR');
  fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
  expect(await failure()).toBe('PROVIDER_ERROR');
});

test('a slow provider is cut off and reported as TIMEOUT', async () => {
  process.env.AI_TIMEOUT_MS = '20';
  fetchMock.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason));
  }));
  expect(await failure()).toBe('TIMEOUT');
});

test('an answer that is not the expected JSON is reported as INVALID_RESPONSE', async () => {
  const malformed = [
    new Response('<html>Bad gateway</html>'),
    new Response(JSON.stringify({ choices: [] })),
    answer(null),
    answer('I cannot help with that.'),
    answer('{"unfinished": '),
  ];
  for (const response of malformed) {
    fetchMock.mockResolvedValueOnce(response);
    expect(await failure()).toBe('INVALID_RESPONSE');
  }
});

test('stops calling the provider after the daily limit', async () => {
  process.env.AI_DAILY_LIMIT = '2';
  fetchMock.mockImplementation(async () => answer('{}'));
  await chatJson(messages);
  await chatJson(messages);
  expect(await failure()).toBe('LIMIT_REACHED');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

describe('embeddings', () => {
  beforeEach(() => { process.env.AI_EMBEDDING_MODEL = 'test-embedding'; });
  afterAll(() => { delete process.env.AI_EMBEDDING_MODEL; });

  test('returns one vector per text, in the order of the texts', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] })));
    expect(await embed(['a', 'b'])).toEqual({ model: 'test-embedding', vectors: [[1, 0], [0, 1]] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/embeddings`);
    expect(JSON.parse(String(init?.body))).toEqual({ model: 'test-embedding', input: ['a', 'b'] });
  });

  test('a missing model, a missing vector or a non-number is reported as unavailable', async () => {
    const reason = (promise: Promise<unknown>) => promise.then(() => 'none', (error: AiUnavailableError) => error.reason);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] })));
    expect(await reason(embed(['a']))).toBe('INVALID_RESPONSE');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ index: 0, embedding: ['x'] }] })));
    expect(await reason(embed(['a']))).toBe('INVALID_RESPONSE');
    delete process.env.AI_EMBEDDING_MODEL;
    expect(await reason(embed(['a']))).toBe('NOT_CONFIGURED');
  });
});
