import type { RequestHandler } from 'express';

// On the live site the frontend has its own address, so the browser asks the
// API for permission before each call. Only the configured frontend is allowed.
export function allowOrigin(origin: string): RequestHandler {
  return (req, res, next) => {
    res.vary('Origin');
    if (req.headers.origin !== origin) {
      next();
      return;
    }
    res.set('Access-Control-Allow-Origin', origin);
    if (req.method !== 'OPTIONS') {
      next();
      return;
    }
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Max-Age', '600');
    res.sendStatus(204);
  };
}
