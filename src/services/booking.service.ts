import type { Filter, ObjectId } from "mongodb";
import { env } from "../config/env";
import { bookings, studios } from "../config/db";
import type { AuthUser, BookingDoc, BookingStatus } from "../types";
import type { CreateBookingInput } from "../validators/booking.validators";
import { ApiError } from "../utils/ApiError";
import { parseObjectId } from "../utils/objectId";
import { isInPast, roundMoney, toMinutes } from "../utils/time";

const SLOT_TAKEN_MESSAGE =
  "This time slot is no longer available. It overlaps with an existing confirmed booking for this studio. Please choose a different time.";

/**
 * Finds a CONFIRMED booking that overlaps [startMinutes, endMinutes) on the given date.
 * Overlap is expressed with MongoDB operators: existing.start < newEnd AND existing.end > newStart.
 * Adjacent slots (existing.end == newStart) are allowed.
 */
export function findConfirmedConflict(
  studioId: ObjectId,
  bookingDate: string,
  startMinutes: number,
  endMinutes: number,
  excludeBookingId?: ObjectId,
) {
  const filter: Filter<BookingDoc> = {
    studioId,
    bookingDate,
    status: "Confirmed",
    startMinutes: { $lt: endMinutes },
    endMinutes: { $gt: startMinutes },
  };
  if (excludeBookingId) filter._id = { $ne: excludeBookingId };
  return bookings().findOne(filter, { projection: { _id: 1 } });
}

export async function createBooking(user: AuthUser, input: CreateBookingInput) {
  const studioId = parseObjectId(input.studioId, "studio id");
  const studio = await studios().findOne({ _id: studioId });
  if (!studio) throw ApiError.notFound("Studio not found");

  const startMinutes = toMinutes(input.startTime);
  const endMinutes = toMinutes(input.endTime);

  if (isInPast(input.bookingDate, startMinutes, env.BOOKING_UTC_OFFSET_MINUTES)) {
    throw ApiError.badRequest("The selected start time has already passed. Please choose a future time.");
  }

  // Challenge 2: server-side double-booking prevention against Confirmed bookings.
  if (await findConfirmedConflict(studioId, input.bookingDate, startMinutes, endMinutes)) {
    throw ApiError.conflict(SLOT_TAKEN_MESSAGE);
  }

  // Stop one user from stacking duplicate open requests for overlapping times on the same studio.
  const duplicate = await bookings().findOne(
    {
      studioId,
      userEmail: user.email,
      bookingDate: input.bookingDate,
      status: { $in: ["Pending", "Confirmed"] },
      startMinutes: { $lt: endMinutes },
      endMinutes: { $gt: startMinutes },
    },
    { projection: { _id: 1 } },
  );
  if (duplicate) throw ApiError.conflict("You already have an active booking request for an overlapping time at this studio.");

  const durationHours = (endMinutes - startMinutes) / 60;
  const now = new Date();
  // Price is always computed on the server from the stored hourly rate.
  const doc: Omit<BookingDoc, "_id"> = {
    studioId,
    studioTitle: studio.title,
    studioImage: studio.imageUrl,
    studioLocation: studio.location,
    studioCategory: studio.category,
    ownerEmail: studio.ownerEmail,
    ownerName: studio.ownerName,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    bookingDate: input.bookingDate,
    startTime: input.startTime,
    endTime: input.endTime,
    startMinutes,
    endMinutes,
    durationHours,
    hourlyRate: studio.hourlyRate,
    totalPrice: roundMoney(studio.hourlyRate * durationHours),
    securityDeposit: studio.securityDeposit,
    ...(input.notes ? { notes: input.notes } : {}),
    status: "Pending",
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await bookings().insertOne(doc as BookingDoc);
  return { _id: insertedId, ...doc };
}

export const listMyBookings = (user: AuthUser) =>
  bookings().find({ userEmail: user.email }).sort({ createdAt: -1 }).toArray();

/** Bookings made on studios owned by this user (host view). */
export const listHostBookings = (user: AuthUser) =>
  bookings().find({ ownerEmail: user.email }).sort({ createdAt: -1 }).toArray();

/** Public: only the time ranges of confirmed bookings, no personal data. */
export async function getAvailability(studioIdRaw: string, date: string) {
  const studioId = parseObjectId(studioIdRaw, "studio id");
  const slots = await bookings()
    .find({ studioId, bookingDate: date, status: "Confirmed" }, { projection: { _id: 0, startTime: 1, endTime: 1 } })
    .sort({ startMinutes: 1 })
    .toArray();
  return slots;
}

/** Booker cancels their own PENDING booking. */
export async function cancelBooking(id: string, user: AuthUser) {
  const _id = parseObjectId(id, "booking id");
  const updated = await bookings().findOneAndUpdate(
    { _id, userEmail: user.email, status: "Pending" },
    { $set: { status: "Cancelled", cancelReason: "Cancelled by the guest", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (updated) return updated;

  // Work out why nothing matched so the client gets a precise error.
  const existing = await bookings().findOne({ _id }, { projection: { userEmail: 1, status: 1 } });
  if (!existing) throw ApiError.notFound("Booking not found");
  if (existing.userEmail !== user.email) throw ApiError.forbidden("You can only cancel your own bookings");
  throw ApiError.conflict(`Only pending bookings can be cancelled. This booking is already ${existing.status}.`);
}

const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Completed", "Cancelled"],
  Completed: [],
  Cancelled: [],
};

/** Host moves a booking through its lifecycle. Confirming re-runs the overlap check. */
export async function updateBookingStatusAsHost(id: string, user: AuthUser, next: Exclude<BookingStatus, "Pending">) {
  const _id = parseObjectId(id, "booking id");
  const booking = await bookings().findOne({ _id });
  if (!booking) throw ApiError.notFound("Booking not found");
  if (booking.ownerEmail !== user.email) throw ApiError.forbidden("Only the studio host can update this booking");
  if (!TRANSITIONS[booking.status].includes(next)) {
    throw ApiError.conflict(`A ${booking.status} booking cannot be changed to ${next}.`);
  }

  if (next === "Confirmed" && (await findConfirmedConflict(booking.studioId, booking.bookingDate, booking.startMinutes, booking.endMinutes, booking._id))) {
    throw ApiError.conflict(SLOT_TAKEN_MESSAGE);
  }

  const updated = await bookings().findOneAndUpdate(
    { _id, ownerEmail: user.email, status: booking.status },
    {
      $set: {
        status: next,
        updatedAt: new Date(),
        ...(next === "Cancelled" ? { cancelReason: "Cancelled by the host" } : {}),
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw ApiError.conflict("This booking was changed by someone else. Please refresh and try again.");
  return updated;
}
