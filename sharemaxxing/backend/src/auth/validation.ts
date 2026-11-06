import { ApiError } from '../lib/errors';

function invalid(message: string): never {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}

export function credentials(body: unknown): { email: string; password: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid('JSON nesnesi gönderilmelidir.');
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254) invalid('Geçerli bir İTÜ e-postası girin.');
  const normalized = email.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@itu\.edu\.tr$/.test(normalized)) {
    invalid('Yalnızca @itu.edu.tr adresleri kabul edilir.');
  }
  // Do not trim passwords: spaces are part of the user's password.
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    invalid('Parola 8–128 karakter olmalıdır.');
  }
  return { email: normalized, password };
}

export function signupInput(body: unknown): { email: string; password: string; displayName: string } {
  const input = credentials(body);
  const { displayName, ...rest } = body as Record<string, unknown>;
  if (typeof displayName !== 'string' || !displayName.trim() || displayName.trim().length > 100) {
    invalid('Görünen ad 1–100 karakter olmalıdır.');
  }
  if (Object.keys(rest).some(key => key !== 'email' && key !== 'password')) {
    invalid('Yalnızca email, password ve displayName alanları gönderilebilir.');
  }
  return { ...input, displayName: displayName.trim() };
}
