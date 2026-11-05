import { asyncHandler } from "../utils/asyncHandler";
import { requireUser } from "../middleware/auth";
import * as wishlistService from "../services/wishlist.service";
import { getDashboardStats } from "../services/dashboard.service";

export const verify = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: requireUser(req) } });
});

export const stats = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getDashboardStats(requireUser(req)) });
});

export const wishlistList = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await wishlistService.listWishlist(requireUser(req)) });
});

export const wishlistAdd = asyncHandler(async (req, res) => {
  await wishlistService.addToWishlist(requireUser(req), String(req.params.studioId));
  res.status(201).json({ success: true, message: "Saved to your wishlist" });
});

export const wishlistRemove = asyncHandler(async (req, res) => {
  await wishlistService.removeFromWishlist(requireUser(req), String(req.params.studioId));
  res.json({ success: true, message: "Removed from your wishlist" });
});
