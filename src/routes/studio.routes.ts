import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { reviewBodySchema, studioBodySchema, studioQuerySchema } from "../validators/studio.validators";
import * as c from "../controllers/studio.controller";

const r = Router();

// Public
r.get("/", validate(studioQuerySchema, "query"), c.list);
r.get("/featured", c.featured);

// Private (declared before "/:id" so "mine" is not treated as an id)
r.get("/mine", authenticate, c.mine);
r.post("/", authenticate, validate(studioBodySchema), c.create);

r.get("/:id", c.getOne);
r.put("/:id", authenticate, validate(studioBodySchema), c.update);
r.delete("/:id", authenticate, c.remove);

r.get("/:id/reviews", c.listReviews);
r.post("/:id/reviews", authenticate, validate(reviewBodySchema), c.createReview);

export default r;
