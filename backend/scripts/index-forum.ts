// Indexes forum posts for the optional AI forum search (WBS-23.2):
//   npm run forum:index
// Posts that have no vector, an old vector or a vector of another model are
// (re)indexed one by one. It stops when the provider is unavailable or the
// daily limit is reached; run it again later to continue.
import 'dotenv/config';
import { AiUnavailableError } from '../src/ai/provider';
import { indexPost } from '../src/forum/ai-search';
import { prisma } from '../src/lib/prisma';

async function main() {
  const model = process.env.AI_EMBEDDING_MODEL;
  if (!model) throw new Error('Set AI_BASE_URL, AI_API_KEY and AI_EMBEDDING_MODEL first (docs/AiForumSearch.md).');
  const posts = await prisma.forumPost.findMany({ select: { id: true, updatedAt: true, embedding: { select: { model: true, contentUpdatedAt: true } } } });
  const todo = posts.filter(post => !post.embedding || post.embedding.model !== model || post.embedding.contentUpdatedAt.getTime() !== post.updatedAt.getTime());
  let done = 0;
  try {
    for (const post of todo) if (await indexPost(post.id)) done += 1;
  } catch (error) {
    if (!(error instanceof AiUnavailableError)) throw error;
    console.log(`Stopped: AI provider unavailable (${error.reason}).`);
  }
  console.log(`Indexed ${done} of ${todo.length} posts that needed it (${posts.length} posts in total).`);
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : 'Indexing failed.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
