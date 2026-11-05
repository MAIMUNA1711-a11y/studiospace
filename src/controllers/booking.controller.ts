import { asyncHandler } from "../utils/asyncHandler";
import { requireUser } from "../middleware/auth";
import * as bookingService from "../services/booking.service";
import type { CreateBookingInput } from "../validators/booking.validators";
import type { BookingStatus } from "../types";

export const create = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking(requireUser(req), req.body as CreateBookingInput);
  res.status(201).json({ success: true, message: "Booking request submitted. Status: Pending", data: booking });
});

export const mine = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await bookingService.listMyBookings(requireUser(req)) });
});

export const host = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await bookingService.listHostBookings(requireUser(req)) });
});

export const availability = asyncHandler(async (req, res) => {
  const { studioId, date } = req.query as unknown as { studioId: string; date: string };
  res.json({ success: true, data: await bookingService.getAvailability(studioId, date) });
});

export const cancel = asyncHandler(async (req, res) => {
  const booking = await bookingService.cancelBooking(String(req.params.id), requireUser(req));
  res.json({ success: true, message: "Booking cancelled", data: booking });
});

export const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body as { status: Exclude<BookingStatus, "Pending"> };
  const booking = await bookingService.updateBookingStatusAsHost(String(req.params.id), requireUser(req), status);
  res.json({ success: true, message: `Booking marked as ${status}`, data: booking });
});
