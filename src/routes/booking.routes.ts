import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { availabilityQuerySchema, createBookingSchema, updateBookingStatusSchema } from "../validators/booking.validators";
import * as c from "../controllers/booking.controller";

const r = Router();

r.get("/availability", validate(availabilityQuerySchema, "query"), c.availability); // public, no PII

r.post("/", authenticate, validate(createBookingSchema), c.create);
r.get("/mine", authenticate, c.mine);
r.get("/host", authenticate, c.host);
r.patch("/:id/cancel", authenticate, c.cancel);
r.patch("/:id/status", authenticate, validate(updateBookingStatusSchema), c.updateStatus);

export default r;
