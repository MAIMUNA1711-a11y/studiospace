import { reviews, studios } from "../config/db";
import type { AuthUser } from "../types";
import type { ReviewInput } from "../validators/studio.validators";
import { ApiError } from "../utils/ApiError";
import { parseObjectId } from "../utils/objectId";
import { roundMoney } from "../utils/time";

export async function listReviews(studioId: string) {
  const _id = parseObjectId(studioId, "studio id");
  return reviews().find({ studioId: _id }).sort({ createdAt: -1 }).limit(100).toArray();
}

export async function createReview(studioId: string, user: AuthUser, input: ReviewInput) {
  const _id = parseObjectId(studioId, "studio id");
  const studio = await studios().findOne({ _id });
  if (!studio) throw ApiError.notFound("Studio not found");
  if (studio.ownerEmail === user.email) throw ApiError.forbidden("You cannot review your own studio");

  const doc = {
    studioId: _id,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    userImage: user.image,
    rating: input.rating,
    comment: input.comment,
    createdAt: new Date(),
  };

  try {
    const { insertedId } = await reviews().insertOne(doc as never);
    await recalculateRating(_id);
    return { _id: insertedId, ...doc };
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw ApiError.conflict("You have already reviewed this studio");
    throw err;
  }
}

export async function recalculateRating(studioId: import("mongodb").ObjectId) {
  const [agg] = await reviews()
    .aggregate<{ avg: number; count: number }>([
      { $match: { studioId } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ])
    .toArray();
  await studios().updateOne(
    { _id: studioId },
    { $set: { rating: agg ? Math.round(agg.avg * 10) / 10 : 0, reviewCount: agg?.count ?? 0 } },
  );
  return roundMoney(agg?.avg ?? 0);
}
