import type { Filter, Sort } from "mongodb";
import { bookings, reviews, studios, wishlists } from "../config/db";
import type { AuthUser, StudioDoc } from "../types";
import type { StudioInput, StudioQuery } from "../validators/studio.validators";
import { ApiError } from "../utils/ApiError";
import { escapeRegex } from "../utils/escapeRegex";
import { parseObjectId } from "../utils/objectId";

const SORTS: Record<StudioQuery["sort"], Sort> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  price_asc: { hourlyRate: 1, _id: 1 },
  price_desc: { hourlyRate: -1, _id: 1 },
  rating: { rating: -1, reviewCount: -1, createdAt: -1 },
};

export async function listStudios(q: StudioQuery) {
  const filter: Filter<StudioDoc> = {};
  if (q.category) filter.category = q.category;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), "i");
    filter.$or = [{ title: rx }, { location: rx }, { category: rx }, { amenities: rx }];
  }
  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.hourlyRate = {
      ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}),
    };
  }
  if (q.minRating !== undefined) filter.rating = { $gte: q.minRating };

  const [data, total] = await Promise.all([
    studios()
      .find(filter)
      .sort(SORTS[q.sort])
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .toArray(),
    studios().countDocuments(filter),
  ]);

  return { data, pagination: { page: q.page, limit: q.limit, total, totalPages: Math.max(1, Math.ceil(total / q.limit)) } };
}

/** Home page: top-rated first, newest as tie-breaker, hard limit of 6. */
export function featuredStudios() {
  return studios().find({}).sort({ rating: -1, reviewCount: -1, createdAt: -1 }).limit(6).toArray();
}

export function listMyStudios(user: AuthUser) {
  return studios().find({ ownerEmail: user.email }).sort({ createdAt: -1 }).toArray();
}

export async function getStudio(id: string) {
  const studio = await studios().findOne({ _id: parseObjectId(id, "studio id") });
  if (!studio) throw ApiError.notFound("Studio not found");
  return studio;
}

export async function createStudio(user: AuthUser, input: StudioInput) {
  const now = new Date();
  // Owner fields always come from the verified token, never from the request body.
  const doc: Omit<StudioDoc, "_id"> = {
    ...input,
    ownerId: user.id,
    ownerName: user.name,
    ownerEmail: user.email,
    ownerImage: user.image,
    rating: 0,
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await studios().insertOne(doc as StudioDoc);
  return { _id: insertedId, ...doc } as StudioDoc;
}

async function loadOwned(id: string, user: AuthUser) {
  const studio = await getStudio(id);
  if (studio.ownerEmail !== user.email) {
    throw ApiError.forbidden("You can only modify your own studio listings");
  }
  return studio;
}

export async function updateStudio(id: string, user: AuthUser, input: StudioInput) {
  const existing = await loadOwned(id, user);
  // Filter on ownerEmail too so the ownership check is enforced atomically.
  const updated = await studios().findOneAndUpdate(
    { _id: existing._id, ownerEmail: user.email },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) throw ApiError.forbidden("You can only modify your own studio listings");
  return updated;
}

export async function deleteStudio(id: string, user: AuthUser) {
  const existing = await loadOwned(id, user);
  const { deletedCount } = await studios().deleteOne({ _id: existing._id, ownerEmail: user.email });
  if (!deletedCount) throw ApiError.forbidden("You can only modify your own studio listings");

  // Clean up dependants: open bookings are cancelled (kept for the booker's history), reviews/wishlists removed.
  await Promise.all([
    bookings().updateMany(
      { studioId: existing._id, status: { $in: ["Pending", "Confirmed"] } },
      { $set: { status: "Cancelled", cancelReason: "Studio listing was removed by the host", updatedAt: new Date() } },
    ),
    reviews().deleteMany({ studioId: existing._id }),
    wishlists().deleteMany({ studioId: existing._id }),
  ]);
}
