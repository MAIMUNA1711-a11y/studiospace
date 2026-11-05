import { Router } from "express";
import { authenticate } from "../middleware/auth";
import * as c from "../controllers/misc.controller";

export const authRoutes = Router();
authRoutes.get("/verify", authenticate, c.verify);

export const dashboardRoutes = Router();
dashboardRoutes.get("/stats", authenticate, c.stats);

export const wishlistRoutes = Router();
wishlistRoutes.use(authenticate);
wishlistRoutes.get("/", c.wishlistList);
wishlistRoutes.post("/:studioId", c.wishlistAdd);
wishlistRoutes.delete("/:studioId", c.wishlistRemove);
