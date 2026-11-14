import { Prisma, type User, type HousingListing } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/errors';
import { invalid, object, text, uuid, page } from '../content/validation';
import { queueHumanReview } from '../content/review';
type Actor = Pick<User, 'id' | 'role'>;
const author = { select: { id: true, displayName: true } };
const include = { author, district: true };
const missing = () => new ApiError(404, 'NOT_FOUND', 'İlan bulunamadı.');
function input(value: unknown, partial = false) {
  const data = object(value, ['districtId', 'listingType', 'title', 'description', 'contactDetails', ...(partial ? ['status'] : [])]);
  if (!Object.keys(data).length) throw invalid();
  const result: { districtId?: string; listingType?: 'HAVE_ROOM' | 'NEED_ROOM'; title?: string; description?: string; contactDetails?: string | null; status?: 'ACTIVE' | 'CLOSED' } = {};
  for (const key of ['districtId', 'listingType', 'title', 'description'] as const) {
    if (!partial || key in data) {
      if (key === 'districtId') result[key] = uuid(data[key]);
      else if (key === 'listingType') {
        if (data[key] !== 'HAVE_ROOM' && data[key] !== 'NEED_ROOM') throw invalid();
        result[key] = data[key];
      } else result[key] = text(data[key], key === 'title' ? 160 : 6000);
    }
  }
  if ('contactDetails' in data) result.contactDetails = data.contactDetails === null || data.contactDetails === '' ? null : text(data.contactDetails, 250);
  if ('status' in data) {
    if (data.status !== 'ACTIVE' && data.status !== 'CLOSED') throw invalid();
    result.status = data.status;
  }
  return result;
}
async function district(tx: Prisma.TransactionClient, id?: string) {
  if (id && !await tx.istanbulDistrict.findUnique({ where: { id } })) throw invalid();
}
function visible(row: HousingListing, actor: Actor) {
  return row.authorId === actor.id || actor.role !== 'USER' || (row.status === 'ACTIVE' && !row.hiddenAt);
}
export async function listHousing(actor: Actor, query: unknown, mine = false) {
  const data = object(query, ['districtId', 'listingType', 'page']);
  const current = page(data.page);
  const where: Prisma.HousingListingWhereInput = mine ? { authorId: actor.id } : { status: 'ACTIVE', hiddenAt: null };
  if (data.districtId !== undefined) where.districtId = uuid(data.districtId);
  if (data.listingType !== undefined) {
    if (data.listingType !== 'HAVE_ROOM' && data.listingType !== 'NEED_ROOM') throw invalid();
    where.listingType = data.listingType;
  }
  const rows = await prisma.housingListing.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (current - 1) * 20, take: 21 });
  return { listings: rows.slice(0, 20), page: current, hasMore: rows.length > 20 };
}
export async function getHousing(actor: Actor, id: string) {
  const row = await prisma.housingListing.findUnique({ where: { id: uuid(id) }, include });
  if (!row || !visible(row, actor)) throw missing();
  return row;
}
export async function createHousing(actor: Actor, value: unknown) {
  const data = input(value);
  return prisma.$transaction(async tx => {
    await district(tx, data.districtId);
    const row = await tx.housingListing.create({ data: { authorId: actor.id, districtId: data.districtId!, listingType: data.listingType!, title: data.title!, description: data.description!, contactDetails: data.contactDetails }, include });
    await queueHumanReview(tx, { targetHousingId: row.id });
    return row;
  });
}
export async function changeHousing(actor: Actor, id: string, value?: unknown, remove = false) {
  uuid(id);
  const data = remove ? undefined : input(value, true);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM housing_listings WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.housingListing.findUnique({ where: { id } });
    if (!row) throw missing();
    if (row.authorId !== actor.id) throw new ApiError(403, 'FORBIDDEN', 'Yalnızca kendi ilanınızı değiştirebilirsiniz.');
    if (data) {
      await district(tx, data.districtId);
      const updated = await tx.housingListing.update({ where: { id }, data, include });
      await queueHumanReview(tx, { targetHousingId: id });
      return updated;
    }
    await tx.moderationCase.updateMany({ where: { targetHousingId: id, status: 'ACTIVE' }, data: { status: 'SOLVED', resolution: 'CONTENT_DELETED', resolvedAt: new Date() } });
    await tx.housingListing.delete({ where: { id } });
    return null;
  });
}
