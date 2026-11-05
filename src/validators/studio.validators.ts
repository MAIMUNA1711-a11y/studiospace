import { z } from "zod";
import { STUDIO_CATEGORIES } from "../types";
import { emptyToUndefined, httpUrl } from "./common";

export const studioBodySchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(100),
  category: z.enum(STUDIO_CATEGORIES, { message: `Category must be one of: ${STUDIO_CATEGORIES.join(", ")}` }),
  hourlyRate: z.coerce.number({ message: "Hourly rate must be a number" }).positive("Hourly rate must be greater than 0").max(10_000),
  securityDeposit: z.coerce.number({ message: "Security deposit must be a number" }).min(0, "Security deposit cannot be negative").max(100_000),
  maxCapacity: z.coerce.number({ message: "Max capacity must be a number" }).int("Max capacity must be a whole number").min(1).max(1000),
  location: z.string().trim().min(3, "Location must be at least 3 characters").max(200),
  imageUrl: httpUrl,
  gallery: z.array(httpUrl).max(8, "At most 8 gallery images").default([]),
  amenities: z
    .array(z.string().trim().min(1).max(50))
    .max(30, "At most 30 amenities")
    .default([])
    .transform((a) => [...new Set(a)]),
  overview: z.string().trim().min(20, "Overview must be at least 20 characters").max(5000),
});
export type StudioInput = z.infer<typeof studioBodySchema>;

export const studioQuerySchema = z.object({
  search: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  category: z.preprocess(emptyToUndefined, z.enum(STUDIO_CATEGORIES).optional()),
  minPrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  maxPrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  minRating: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(5).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(["newest", "oldest", "price_asc", "price_desc", "rating"]).default("newest")),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(50).default(12)),
});
export type StudioQuery = z.infer<typeof studioQuerySchema>;

export const reviewBodySchema = z.object({
  rating: z.coerce.number({ message: "Rating must be a number" }).int().min(1, "Rating must be 1-5").max(5, "Rating must be 1-5"),
  comment: z.string().trim().min(5, "Review must be at least 5 characters").max(1000),
});
export type ReviewInput = z.infer<typeof reviewBodySchema>;
