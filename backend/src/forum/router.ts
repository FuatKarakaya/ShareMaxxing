import { Router } from 'express';
import { authenticate } from '../auth/middleware';
import { prisma } from '../lib/prisma';
import { aiSearch } from './ai-search';
import { listQuestions, questionDetail, createQuestion, createAnswer, changePost, type ReplyEmail } from './service';
export function createForumRouter(sendEmail?: ReplyEmail): Router {
  const router = Router();
  router.use(authenticate, (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.get('/categories', async (_req, res, next) => {
    try { res.json({ categories: await prisma.forumCategory.findMany({ orderBy: { code: 'asc' } }) }); } catch (error) { next(error); }
  });
  router.get('/ai-search', async (req, res, next) => {
    try { res.json(await aiSearch(res.locals.user, req.query)); } catch (error) { next(error); }
  });
  router.get('/questions/mine', async (req, res, next) => {
    try { res.json(await listQuestions(res.locals.user, req.query, true)); } catch (error) { next(error); }
  });
  router.get('/questions', async (req, res, next) => {
    try { res.json(await listQuestions(res.locals.user, req.query)); } catch (error) { next(error); }
  });
  router.get('/questions/:id', async (req, res, next) => {
    try { res.json(await questionDetail(res.locals.user, req.params.id, req.query)); } catch (error) { next(error); }
  });
  router.post('/questions', async (req, res, next) => {
    try { res.status(201).json({ question: await createQuestion(res.locals.user, req.body) }); } catch (error) { next(error); }
  });
  router.post('/questions/:id/answers', async (req, res, next) => {
    try { res.status(201).json({ answer: await createAnswer(res.locals.user, req.params.id, req.body, sendEmail) }); } catch (error) { next(error); }
  });
  router.patch('/posts/:id', async (req, res, next) => {
    try { res.json({ post: await changePost(res.locals.user, req.params.id, req.body) }); } catch (error) { next(error); }
  });
  router.delete('/posts/:id', async (req, res, next) => {
    try { await changePost(res.locals.user, req.params.id, undefined, true); res.status(204).end(); } catch (error) { next(error); }
  });
  return router;
}
