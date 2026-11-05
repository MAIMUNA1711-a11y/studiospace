import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env";
import studioRoutes from "./routes/studio.routes";
import bookingRoutes from "./routes/booking.routes";
import { authRoutes, dashboardRoutes, wishlistRoutes } from "./routes/misc.routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // Render/Vercel sit behind a proxy
  app.disable("x-powered-by");
  app.use(helmet());

  app.use(
    cors({
      origin(origin, cb) {
        // No Origin header = server-to-server (e.g. the Next.js proxy) or curl: allow.
        if (!origin || env.allowedOrigins.includes(origin)) return cb(null, true);
        cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.use(
    "/api",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { success: false, message: "Too many requests, please try again later." },
    }),
  );

  app.get("/", (_req, res) => res.json({ success: true, name: "StudioSpace API", status: "ok" }));
  app.get("/api/health", (_req, res) => res.json({ success: true, status: "ok", time: new Date().toISOString() }));

  app.use("/api/auth", authRoutes);
  app.use("/api/studios", studioRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/wishlist", wishlistRoutes);
  app.use("/api/dashboard", dashboardRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
