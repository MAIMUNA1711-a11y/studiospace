import { asyncHandler } from "../utils/asyncHandler";
import { requireUser } from "../middleware/auth";
import * as studioService from "../services/studio.service";
import * as reviewService from "../services/review.service";
import type { StudioInput, StudioQuery, ReviewInput } from "../validators/studio.validators";

export const list = asyncHandler(async (req, res) => {
  const result = await studioService.listStudios(req.query as unknown as StudioQuery);
  res.json({ success: true, ...result });
});

export const featured = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await studioService.featuredStudios() });
});

export const mine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await studioService.listMyStudios(requireUser(req)) });
});

export const getOne = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await studioService.getStudio(String(req.params.id)) });
});

export const create = asyncHandler(async (req, res) => {
  const studio = await studioService.createStudio(requireUser(req), req.body as StudioInput);
  res.status(201).json({ success: true, message: "Studio created successfully", data: studio });
});

export const update = asyncHandler(async (req, res) => {
  const studio = await studioService.updateStudio(String(req.params.id), requireUser(req), req.body as StudioInput);
  res.json({ success: true, message: "Studio updated successfully", data: studio });
});

export const remove = asyncHandler(async (req, res) => {
  await studioService.deleteStudio(String(req.params.id), requireUser(req));
  res.json({ success: true, message: "Studio deleted successfully" });
});

export const listReviews = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await reviewService.listReviews(String(req.params.id)) });
});

export const createReview = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(String(req.params.id), requireUser(req), req.body as ReviewInput);
  res.status(201).json({ success: true, message: "Thanks for your review!", data: review });
});
