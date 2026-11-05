import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "./env";
import type { BookingDoc, ReviewDoc, StudioDoc, WishlistDoc } from "../types";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectDb(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  db = client.db(env.MONGODB_DB_NAME);
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Database not connected. Call connectDb() first.");
  return db;
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

export const studios = (): Collection<StudioDoc> => getDb().collection<StudioDoc>("studios");
export const bookings = (): Collection<BookingDoc> => getDb().collection<BookingDoc>("bookings");
export const reviews = (): Collection<ReviewDoc> => getDb().collection<ReviewDoc>("reviews");
export const wishlists = (): Collection<WishlistDoc> => getDb().collection<WishlistDoc>("wishlists");

/** Idempotent: safe to call on every boot. */
export async function ensureIndexes(): Promise<void> {
  await Promise.all([
    studios().createIndexes([
      { key: { ownerEmail: 1, createdAt: -1 }, name: "owner_created" },
      { key: { category: 1, createdAt: -1 }, name: "category_created" },
      { key: { rating: -1, createdAt: -1 }, name: "rating_created" },
      { key: { hourlyRate: 1 }, name: "hourly_rate" },
    ]),
    bookings().createIndexes([
      // Drives the double-booking overlap query.
      { key: { studioId: 1, bookingDate: 1, status: 1, startMinutes: 1, endMinutes: 1 }, name: "studio_slot_lookup" },
      { key: { userEmail: 1, createdAt: -1 }, name: "booker_created" },
      { key: { ownerEmail: 1, createdAt: -1 }, name: "host_created" },
    ]),
    reviews().createIndexes([
      { key: { studioId: 1, createdAt: -1 }, name: "studio_reviews" },
      // One review per user per studio.
      { key: { studioId: 1, userEmail: 1 }, name: "one_review_per_user", unique: true },
    ]),
    wishlists().createIndexes([
      { key: { userEmail: 1, studioId: 1 }, name: "one_wish_per_user", unique: true },
    ]),
  ]);
}
