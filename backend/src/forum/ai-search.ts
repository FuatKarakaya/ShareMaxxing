import type { User } from '@prisma/client';
import { AiUnavailableError, embed } from '../ai/provider';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { invalid, object } from '../content/validation';

// Optional AI forum search (WBS-23.2), see docs/AiForumSearch.md.
// Every question and answer gets an embedding vector. A natural-language
// query is turned into a vector too, and the closest posts are returned with
// a link to their question. The results are always existing posts (NFR-11).

const MAX_RESULTS = 5;
const minScore = () => {
  const value = Number(process.env.AI_SEARCH_MIN_SCORE);
  return Number.isFinite(value) && value > 0 && value < 1 ? value : 0.6;
};

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let lengthA = 0;
  let lengthB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    lengthA += a[i] * a[i];
    lengthB += b[i] * b[i];
  }
  return lengthA && lengthB ? dot / Math.sqrt(lengthA * lengthB) : 0;
}

// Indexes one post. Returns false when the post is gone or changed meanwhile.
export async function indexPost(postId: string): Promise<boolean> {
  const post = await prisma.forumPost.findUnique({ where: { id: postId }, select: { title: true, body: true, updatedAt: true } });
  if (!post) return false;
  const { model, vectors } = await embed([post.title ? `${post.title}\n\n${post.body}` : post.body]);
  return prisma.$transaction(async tx => {
    // Same lock order as the forum service, so a delete cannot happen in between.
    const row = await tx.forumPost.findUnique({ where: { id: postId }, select: { parentPostId: true, updatedAt: true } });
    if (!row) return false;
    await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${row.parentPostId ?? postId}::uuid FOR UPDATE`;
    const current = await tx.forumPost.findUnique({ where: { id: postId }, select: { updatedAt: true } });
    if (!current || current.updatedAt.getTime() !== post.updatedAt.getTime()) return false;
    const data = { model, vector: vectors[0], contentUpdatedAt: post.updatedAt };
    await tx.forumPostEmbedding.upsert({ where: { postId }, create: { postId, ...data }, update: data });
    return true;
  });
}

const running = new Set<Promise<void>>();

// Call after a post is saved. Runs in the background; a failure only means the
// post is missing from AI search until "npm run forum:index" runs.
export function indexInBackground(postId: string): void {
  if (!process.env.AI_EMBEDDING_MODEL) return;
  const job = indexPost(postId)
    .then(() => undefined)
    .catch(error => {
      if (error instanceof AiUnavailableError) console.warn('AI_INDEX_UNAVAILABLE', error.reason);
      else console.error('AI_INDEX_FAILED', error instanceof Error ? error.name : 'UnknownError');
    })
    .finally(() => { running.delete(job); });
  running.add(job);
}

export async function indexingSettled(): Promise<void> {
  while (running.size) await Promise.all(running);
}

export async function aiSearch(_actor: Pick<User, 'id'>, rawQuery: unknown) {
  const { q } = object(rawQuery, ['q']);
  if (typeof q !== 'string' || !q.trim() || q.length > 300) throw invalid();

  let query: { model: string; vectors: number[][] };
  try {
    query = await embed([q.trim()]);
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
    // UC-16 E1: the page then offers keyword search.
    throw new ApiError(503, 'AI_SEARCH_UNAVAILABLE', 'Yapay zekâ araması şu an kullanılamıyor. Anahtar kelimeyle arayın.');
  }

  // Only visible posts of visible questions, indexed with the same model.
  const rows = await prisma.forumPostEmbedding.findMany({
    where: { model: query.model, post: { hiddenAt: null, OR: [{ kind: 'QUESTION' }, { parent: { hiddenAt: null } }] } },
    select: {
      vector: true,
      post: { select: { id: true, kind: true, title: true, body: true, parent: { select: { id: true, title: true } } } },
    },
  });

  const best = new Map<string, { questionId: string; title: string; excerpt: string; matchedAnswer: boolean; score: number }>();
  const threshold = minScore();
  for (const row of rows) {
    const score = cosine(query.vectors[0], row.vector);
    if (score < threshold) continue;
    const question = row.post.kind === 'QUESTION' ? { id: row.post.id, title: row.post.title } : row.post.parent;
    if (!question) continue;
    const previous = best.get(question.id);
    if (previous && previous.score >= score) continue;
    best.set(question.id, {
      questionId: question.id,
      title: question.title ?? '',
      excerpt: row.post.body.length > 200 ? `${row.post.body.slice(0, 200)}…` : row.post.body,
      matchedAnswer: row.post.kind === 'ANSWER',
      score: Math.round(score * 1000) / 1000,
    });
  }
  const results = [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map(result => ({ ...result, link: `/forum/${result.questionId}` }));
  return { results };
}
