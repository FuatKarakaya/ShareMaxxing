import type { Notification, NotificationKind, Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';

export type DbClient = Prisma.TransactionClient | typeof prisma;

export interface CreateNotificationInput {
  recipientId: string;
  kind: NotificationKind;
  text: string;
  link?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_KINDS = new Set<NotificationKind>([
  'BOOKING',
  'CANCELLATION',
  'RIDE_REMINDER',
  'PAYMENT',
  'FUNDING',
  'FORUM_REPLY',
  'MODERATION',
]);

// Prohibited identity and trip/route metadata keys for anonymous FUNDING notifications (databaseplan.md 4.7, 5.G).
const FORBIDDEN_FUNDING_KEYS = new Set([
  'donorid',
  'payerid',
  'recipientid',
  'driverid',
  'tripid',
  'origincity',
  'destinationcity',
  'origincitycode',
  'destinationcitycode',
  'email',
  'displayname',
]);

const PAGE_SIZE = 20;

function validationError(message: string) {
  return new ApiError(400, 'VALIDATION_ERROR', message);
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
    throw validationError(`${field} geçerli bir kimlik olmalıdır.`);
  }
  return value.toLowerCase();
}

function parseKind(value: unknown): NotificationKind {
  if (typeof value !== 'string' || !VALID_KINDS.has(value as NotificationKind)) {
    throw validationError('Geçersiz bildirim türü.');
  }
  return value as NotificationKind;
}

function parseText(value: unknown): string {
  if (typeof value !== 'string') {
    throw validationError('Bildirim metni metin olmalıdır.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 500) {
    throw validationError('Bildirim metni 1 ile 500 karakter arasında olmalıdır.');
  }
  return trimmed;
}

function parseLink(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw validationError('Bildirim bağlantısı metin olmalıdır.');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.length > 250) {
    throw validationError('Bildirim bağlantısı geçerli bir iç yol olmalıdır.');
  }
  return trimmed;
}

function parseMetadata(
  kind: NotificationKind,
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw validationError('Bildirim ek verisi geçerli bir nesne olmalıdır.');
  }
  const entries: Record<string, string | number | boolean | null> = {};
  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (entryValue === undefined) continue;
    if (
      entryValue !== null &&
      typeof entryValue !== 'string' &&
      typeof entryValue !== 'number' &&
      typeof entryValue !== 'boolean'
    ) {
      throw validationError(`Bildirim ek alanı (${key}) yalnızca ilkel değer olabilir.`);
    }
    if (kind === 'FUNDING' && FORBIDDEN_FUNDING_KEYS.has(key.replace(/_/g, '').toLowerCase())) {
      throw validationError('Askıda bilet bildirimleri kimlik veya rota bilgisi içeremez.');
    }
    entries[key] = entryValue;
  }
  return entries;
}

function parseListQuery(rawQuery: unknown): { page: number; unreadOnly: boolean } {
  if (!rawQuery || typeof rawQuery !== 'object' || Array.isArray(rawQuery)) {
    throw validationError('Sorgu parametreleri geçersiz.');
  }
  const query = rawQuery as Record<string, unknown>;
  for (const key of Object.keys(query)) {
    if (key !== 'page' && key !== 'unreadOnly') {
      throw validationError(`Bilinmeyen sorgu parametresi: ${key}.`);
    }
  }

  let page = 1;
  if (query.page !== undefined && query.page !== '') {
    if (typeof query.page !== 'string' || !/^[1-9]\d{0,3}$/.test(query.page)) {
      throw validationError('page 1 ile 9999 arasında bir tam sayı olmalıdır.');
    }
    page = Number(query.page);
  }

  let unreadOnly = false;
  if (query.unreadOnly !== undefined && query.unreadOnly !== '') {
    if (query.unreadOnly === 'true') {
      unreadOnly = true;
    } else if (query.unreadOnly === 'false') {
      unreadOnly = false;
    } else {
      throw validationError('unreadOnly yalnızca true veya false olabilir.');
    }
  }

  return { page, unreadOnly };
}

function toNotificationResponse(row: Notification) {
  const payloadObj =
    row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  const text = typeof payloadObj.text === 'string' ? payloadObj.text : '';
  const link = typeof payloadObj.link === 'string' ? payloadObj.link : null;

  return {
    id: row.id,
    recipientId: row.recipientId,
    kind: row.kind,
    text,
    link,
    isRead: row.readAt !== null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

export async function createNotification(input: CreateNotificationInput, db: DbClient = prisma) {
  const recipientId = parseUuid(input.recipientId, 'recipientId');
  const kind = parseKind(input.kind);
  const text = parseText(input.text);
  const link = parseLink(input.link);
  const metadata = parseMetadata(kind, input.metadata);

  const payload: Prisma.JsonObject = {
    ...metadata,
    text,
    ...(link ? { link } : {}),
  };

  const row = await db.notification.create({
    data: {
      recipientId,
      kind,
      payload,
    },
  });

  return toNotificationResponse(row);
}

export async function listNotifications(recipientId: string, rawQuery: unknown = {}) {
  const { page, unreadOnly } = parseListQuery(rawQuery);
  const where: Prisma.NotificationWhereInput = {
    recipientId,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
    }),
    prisma.notification.count({ where: { recipientId, readAt: null } }),
  ]);

  return {
    notifications: rows.slice(0, PAGE_SIZE).map(toNotificationResponse),
    unreadCount,
    page,
    hasMore: rows.length > PAGE_SIZE,
  };
}

export async function getUnreadCount(recipientId: string) {
  const unreadCount = await prisma.notification.count({
    where: { recipientId, readAt: null },
  });
  return { unreadCount };
}

export async function markNotificationRead(recipientId: string, rawNotificationId: unknown) {
  const notificationId = parseUuid(rawNotificationId, 'notificationId');

  const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!existing || existing.recipientId !== recipientId) {
    throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Bildirim bulunamadı.');
  }

  if (existing.readAt === null) {
    // Conditional updateMany with readAt: null prevents concurrent requests from overwriting an existing readAt timestamp; we then re-read the row and unread count.
    await prisma.notification.updateMany({
      where: { id: notificationId, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const [updated, unreadCount] = await Promise.all([
    prisma.notification.findUniqueOrThrow({ where: { id: notificationId } }),
    prisma.notification.count({ where: { recipientId, readAt: null } }),
  ]);

  return {
    notification: toNotificationResponse(updated),
    unreadCount,
  };
}

export async function markAllNotificationsRead(recipientId: string) {
  const result = await prisma.notification.updateMany({
    where: { recipientId, readAt: null },
    data: { readAt: new Date() },
  });

  return {
    updatedCount: result.count,
    unreadCount: 0,
  };
}
