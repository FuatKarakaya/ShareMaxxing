import jwt from 'jsonwebtoken';

export const tokenLifetimeSeconds = 3600;
const issuer = 'sharemaxxing';
const audience = 'sharemaxxing-api';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-with-')) {
    throw new Error('JWT_SECRET must be a random secret of at least 32 characters.');
  }
  return secret;
}

export function issueAccessToken(userId: string): string {
  return jwt.sign({}, getJwtSecret(), {
    subject: userId,
    algorithm: 'HS256',
    expiresIn: tokenLifetimeSeconds,
    issuer,
    audience,
  });
}

export function readAccessToken(token: string): string {
  const payload = jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer,
    audience,
  });
  if (typeof payload === 'string' || typeof payload.sub !== 'string'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.sub)) {
    throw new Error('Invalid token subject.');
  }
  return payload.sub;
}
