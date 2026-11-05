import { bookings, studios, wishlists } from "../config/db";
import type { AuthUser } from "../types";
import { roundMoney } from "../utils/time";

export async function getDashboardStats(user: AuthUser) {
  const [listings, myBookingCounts, hostCounts, earnings, wishlistCount] = await Promise.all([
    studios().countDocuments({ ownerEmail: user.email }),
    bookings()
      .aggregate<{ _id: string; count: number; spent: number }>([
        { $match: { userEmail: user.email } },
        { $group: { _id: "$status", count: { $sum: 1 }, spent: { $sum: "$totalPrice" } } },
      ])
      .toArray(),
    bookings()
      .aggregate<{ _id: string; count: number }>([
        { $match: { ownerEmail: user.email } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    bookings()
      .aggregate<{ total: number }>([
        { $match: { ownerEmail: user.email, status: { $in: ["Confirmed", "Completed"] } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ])
      .toArray(),
    wishlists().countDocuments({ userEmail: user.email }),
  ]);

  const toMap = (rows: { _id: string; count: number }[]) =>
    Object.fromEntries(rows.map((r) => [r._id, r.count])) as Record<string, number>;
  const mine = toMap(myBookingCounts);
  const host = toMap(hostCounts);

  return {
    listings,
    wishlist: wishlistCount,
    bookingsMade: {
      total: Object.values(mine).reduce((a, b) => a + b, 0),
      pending: mine.Pending ?? 0,
      confirmed: mine.Confirmed ?? 0,
      completed: mine.Completed ?? 0,
      cancelled: mine.Cancelled ?? 0,
      totalSpent: roundMoney(myBookingCounts.filter((r) => r._id !== "Cancelled").reduce((a, r) => a + r.spent, 0)),
    },
    hosting: {
      incoming: Object.values(host).reduce((a, b) => a + b, 0),
      pending: host.Pending ?? 0,
      confirmed: host.Confirmed ?? 0,
      completed: host.Completed ?? 0,
      earnings: roundMoney(earnings[0]?.total ?? 0),
    },
  };
}
