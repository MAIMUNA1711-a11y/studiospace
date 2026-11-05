import type { ObjectId } from "mongodb";

export const STUDIO_CATEGORIES = [
  "Photo Studio",
  "Sound Stage",
  "Podcast Room",
  "Music Suite",
  "Art Workshop",
] as const;
export type StudioCategory = (typeof STUDIO_CATEGORIES)[number];

export const BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Identity extracted from a verified JWT. Never taken from the request body. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string;
}

export interface StudioDoc {
  _id: ObjectId;
  title: string;
  category: StudioCategory;
  hourlyRate: number;
  securityDeposit: number;
  maxCapacity: number;
  location: string;
  imageUrl: string;
  gallery: string[];
  amenities: string[];
  overview: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  ownerImage?: string;
  rating: number;
  reviewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookingDoc {
  _id: ObjectId;
  studioId: ObjectId;
  studioTitle: string;
  studioImage: string;
  studioLocation: string;
  studioCategory: StudioCategory;
  /** Host of the studio at booking time (used for host-side views and authorization). */
  ownerEmail: string;
  ownerName: string;
  /** The booker. */
  userId: string;
  userEmail: string;
  userName: string;
  bookingDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  startMinutes: number;
  endMinutes: number;
  durationHours: number;
  hourlyRate: number;
  totalPrice: number;
  securityDeposit: number;
  notes?: string;
  status: BookingStatus;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewDoc {
  _id: ObjectId;
  studioId: ObjectId;
  userId: string;
  userEmail: string;
  userName: string;
  userImage?: string;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface WishlistDoc {
  _id: ObjectId;
  userEmail: string;
  studioId: ObjectId;
  createdAt: Date;
}
