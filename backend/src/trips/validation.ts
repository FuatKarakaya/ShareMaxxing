import { ApiError } from '../lib/errors';

export const ISTANBUL_CITY_CODE = 34;
const MIN_CITY_CODE = 1;
const MAX_CITY_CODE = 81;
const MAX_SEAT_CAPACITY = 50;
const MAX_PRICE_MINOR = 100_000_000; // 1,000,000.00 TL in kuruş
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CONTACT_LENGTH = 250;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CREATE_FIELDS = new Set([
  'originCityCode',
  'destinationCityCode',
  'departureAt',
  'seatCapacity',
  'priceMinor',
  'description',
  'contactDetails',
]);

export interface CreateTripInput {
  originCityCode: number;
  destinationCityCode: number;
  departureAt: Date;
  seatCapacity: number;
  priceMinor: bigint;
  description: string | null;
  contactDetails: string | null;
}

export interface UpdateTripInput {
  originCityCode?: number;
  destinationCityCode?: number;
  departureAt?: Date;
  seatCapacity?: number;
  priceMinor?: bigint;
  description?: string | null;
  contactDetails?: string | null;
}

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} geçerli bir kimlik olmalıdır.`);
  }
  return value.toLowerCase();
}

function requirePlainObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'İstek gövdesi geçerli bir nesne olmalıdır.');
  }
  return body as Record<string, unknown>;
}

function rejectUnknownFields(obj: Record<string, unknown>, allowed: Set<string>) {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `Bilinmeyen alan: ${key}.`);
    }
  }
}

export function parseCityCode(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_CITY_CODE || value > MAX_CITY_CODE) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} 1 ile 81 arasında geçerli bir il plaka kodu olmalıdır.`);
  }
  return value;
}

export function validateRouteCities(originCityCode: number, destinationCityCode: number) {
  if (originCityCode === destinationCityCode) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Başlangıç ve varış şehri aynı olamaz.');
  }
  if (originCityCode !== ISTANBUL_CITY_CODE && destinationCityCode !== ISTANBUL_CITY_CODE) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Yolculuğun başlangıç veya varış şehirlerinden biri İstanbul (34) olmalıdır.',
    );
  }
}

function parseDepartureAt(value: unknown, now: Date): Date {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'departureAt geçerli bir ISO tarih-saat metni olmalıdır.');
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'departureAt geçerli bir tarih-saat olmalıdır.');
  }
  if (date <= now) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Kalkış zamanı gelecekte olmalıdır.');
  }
  return date;
}

function parseSeatCapacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_SEAT_CAPACITY) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `seatCapacity 1 ile ${MAX_SEAT_CAPACITY} arasında bir tam sayı olmalıdır.`,
    );
  }
  return value;
}

function parsePriceMinor(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_PRICE_MINOR) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'priceMinor kuruş cinsinden pozitif bir tam sayı olmalıdır.');
  }
  return BigInt(value);
}

function parseOptionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} metin olmalıdır.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${field} en fazla ${maxLength} karakter olabilir.`);
  }
  return trimmed;
}

export function validateCreateTrip(body: unknown, now = new Date()): CreateTripInput {
  const obj = requirePlainObject(body);
  rejectUnknownFields(obj, CREATE_FIELDS);

  const originCityCode = parseCityCode(obj.originCityCode, 'originCityCode');
  const destinationCityCode = parseCityCode(obj.destinationCityCode, 'destinationCityCode');
  validateRouteCities(originCityCode, destinationCityCode);

  const departureAt = parseDepartureAt(obj.departureAt, now);
  const seatCapacity = parseSeatCapacity(obj.seatCapacity);
  const priceMinor = parsePriceMinor(obj.priceMinor);
  const description = parseOptionalText(obj.description, 'description', MAX_DESCRIPTION_LENGTH);
  const contactDetails = parseOptionalText(obj.contactDetails, 'contactDetails', MAX_CONTACT_LENGTH);

  return {
    originCityCode,
    destinationCityCode,
    departureAt,
    seatCapacity,
    priceMinor,
    description,
    contactDetails,
  };
}

export function validateUpdateTrip(body: unknown, now = new Date()): UpdateTripInput {
  const obj = requirePlainObject(body);
  rejectUnknownFields(obj, CREATE_FIELDS);

  const keys = Object.keys(obj).filter(key => obj[key] !== undefined);
  if (keys.length === 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Güncellenecek en az bir alan gönderilmelidir.');
  }

  const input: UpdateTripInput = {};
  if (obj.originCityCode !== undefined) {
    input.originCityCode = parseCityCode(obj.originCityCode, 'originCityCode');
  }
  if (obj.destinationCityCode !== undefined) {
    input.destinationCityCode = parseCityCode(obj.destinationCityCode, 'destinationCityCode');
  }
  if (obj.departureAt !== undefined) {
    input.departureAt = parseDepartureAt(obj.departureAt, now);
  }
  if (obj.seatCapacity !== undefined) {
    input.seatCapacity = parseSeatCapacity(obj.seatCapacity);
  }
  if (obj.priceMinor !== undefined) {
    input.priceMinor = parsePriceMinor(obj.priceMinor);
  }
  if (obj.description !== undefined) {
    input.description = parseOptionalText(obj.description, 'description', MAX_DESCRIPTION_LENGTH);
  }
  if (obj.contactDetails !== undefined) {
    input.contactDetails = parseOptionalText(obj.contactDetails, 'contactDetails', MAX_CONTACT_LENGTH);
  }

  return input;
}
