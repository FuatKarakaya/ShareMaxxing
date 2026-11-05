import type { ErrorRequestHandler } from 'express';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Geçersiz JSON.' } });
    return;
  }
  if (error.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'BODY_TOO_LARGE', message: 'İstek gövdesi çok büyük.' } });
    return;
  }
  console.error('Unhandled API error:', error instanceof Error ? error.name : 'UnknownError');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.' } });
};
