import { z } from "zod";
import { BOOKING_STATUSES } from "../types";
import { isValidDate, isValidTime, toMinutes } from "../utils/time";

export const MIN_BOOKING_MINUTES = 60;
export const MAX_BOOKING_MINUTES = 12 * 60;

const date = z.string().refine(isValidDate, "Booking date must be a valid date in YYYY-MM-DD format");
const time = (label: string) => z.string().refine(isValidTime, `${label} must be in 24-hour HH:mm format`);

export const createBookingSchema = z
  .object({
    studioId: z.string(),
    bookingDate: date,
    startTime: time("Start time"),
    endTime: time("End time"),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (!isValidTime(v.startTime) || !isValidTime(v.endTime)) return;
    const mins = toMinutes(v.endTime) - toMinutes(v.startTime);
    if (mins <= 0) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be after start time" });
    } else if (mins < MIN_BOOKING_MINUTES) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Minimum booking duration is 1 hour" });
    } else if (mins > MAX_BOOKING_MINUTES) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "Maximum booking duration is 12 hours" });
    }
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const updateBookingStatusSchema = z.object({
  status: z.enum(BOOKING_STATUSES.filter((s) => s !== "Pending") as ["Confirmed", "Completed", "Cancelled"], {
    message: "Status must be Confirmed, Completed or Cancelled",
  }),
});

export const availabilityQuerySchema = z.object({
  studioId: z.string(),
  date,
});
