import { ApiError } from '../lib/errors';
export const invalid = () => new ApiError(400, 'INVALID_INPUT', 'Alanları ve filtreleri kontrol edin.');
export function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !allowed.includes(key))) throw invalid();
  return data;
}
export function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw invalid();
  return value.trim();
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw invalid();
  return value;
}
export function page(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^[1-9]\d{0,3}$/.test(value)) throw invalid();
  return Number(value);
}
