import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from './middleware';
import { login, signup } from './service';
import { credentials, signupInput, studentEmail } from './validation';
import { ApiError } from '../lib/errors';
import { object } from '../content/validation';
import { issueVerificationCode, verifyEmailCode } from './verification';
import { sendVerificationCode, type SendVerificationCode } from './verification-mail';

export function createAuthRouter(sendCode: SendVerificationCode = sendVerificationCode): Router {
  const router = Router();
  const authLimit = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Çok fazla istek. Lütfen daha sonra tekrar deneyin.' } },
  });
  async function deliverCode(email: string): Promise<boolean> {
    const code = await issueVerificationCode(email);
    if (!code) return false;
    try {
      await sendCode(email, code);
      return true;
    } catch {
      console.warn('VERIFICATION_EMAIL_UNAVAILABLE');
      return false;
    }
  }

  router.post('/signup', authLimit(), async (req, res, next) => {
    try {
      const result = await signup(signupInput(req.body));
      const verificationEmailSent = await deliverCode(result.user.email);
      res.status(201).json({ ...result, verificationEmailSent });
    } catch (error) {
      next(error);
    }
  });
  router.post('/verification/resend', authLimit(), async (req, res, next) => {
    try {
      const { email: value } = object(req.body, ['email']);
      await deliverCode(studentEmail(value));
      // Keep the same response for missing, verified and throttled accounts.
      res.status(202).json({ message: 'Hesap doğrulama bekliyorsa kod gönderilir. Gerekirse bir dakika sonra yeniden deneyin.' });
    } catch (error) {
      next(error);
    }
  });
  router.post('/verification/verify', authLimit(), async (req, res, next) => {
    try {
      const { email, code } = object(req.body, ['email', 'code']);
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        throw new ApiError(400, 'INVALID_INPUT', 'Altı haneli doğrulama kodu girin.');
      }
      await verifyEmailCode(studentEmail(email), code);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  router.post('/login', authLimit(), async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json(await login(credentials(req.body)));
    } catch (error) {
      next(error);
    }
  });
  router.get('/me', authenticate, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: res.locals.user });
  });
  return router;
}
