import { studios, wishlists } from "../config/db";
import type { AuthUser } from "../types";
import { ApiError } from "../utils/ApiError";
import { parseObjectId } from "../utils/objectId";

export async function listWishlist(user: AuthUser) {
  const items = await wishlists().find({ userEmail: user.email }).sort({ createdAt: -1 }).toArray();
  if (!items.length) return [];
  const docs = await studios().find({ _id: { $in: items.map((i) => i.studioId) } }).toArray();
  const byId = new Map(docs.map((d) => [d._id.toHexString(), d]));
  return items.map((i) => byId.get(i.studioId.toHexString())).filter((s): s is NonNullable<typeof s> => Boolean(s));
}

export async function addToWishlist(user: AuthUser, studioIdRaw: string) {
  const studioId = parseObjectId(studioIdRaw, "studio id");
  if (!(await studios().findOne({ _id: studioId }, { projection: { _id: 1 } }))) throw ApiError.notFound("Studio not found");
  await wishlists().updateOne(
    { userEmail: user.email, studioId },
    { $setOnInsert: { userEmail: user.email, studioId, createdAt: new Date() } },
    { upsert: true },
  );
}

export async function removeFromWishlist(user: AuthUser, studioIdRaw: string) {
  const studioId = parseObjectId(studioIdRaw, "studio id");
  await wishlists().deleteOne({ userEmail: user.email, studioId });
}
