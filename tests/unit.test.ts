import "./setup";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isInPast, isValidDate, isValidTime, overlaps, roundMoney, toMinutes } from "../src/utils/time";
import { parseObjectId } from "../src/utils/objectId";
import { studioBodySchema, studioQuerySchema } from "../src/validators/studio.validators";
import { createBookingSchema } from "../src/validators/booking.validators";

describe("time utils", () => {
  it("converts HH:mm to minutes and validates", () => {
    assert.equal(toMinutes("00:00"), 0);
    assert.equal(toMinutes("09:30"), 570);
    assert.equal(toMinutes("23:59"), 1439);
    assert.throws(() => toMinutes("24:00"));
    assert.ok(isValidTime("07:05"));
    assert.ok(!isValidTime("7:05"));
    assert.ok(!isValidTime("12:60"));
  });
  it("validates real calendar dates", () => {
    assert.ok(isValidDate("2028-02-29"));
    assert.ok(!isValidDate("2027-02-29"));
    assert.ok(!isValidDate("2027-13-01"));
    assert.ok(!isValidDate("27-01-01"));
  });
  it("overlap logic (half-open intervals)", () => {
    // existing 10:00-12:00
    const [s, e] = [600, 720];
    assert.equal(overlaps(660, 780, s, e), true, "partial overlap at the end");
    assert.equal(overlaps(540, 660, s, e), true, "partial overlap at the start");
    assert.equal(overlaps(630, 690, s, e), true, "fully contained");
    assert.equal(overlaps(540, 780, s, e), true, "fully enclosing");
    assert.equal(overlaps(600, 720, s, e), true, "identical");
    assert.equal(overlaps(720, 840, s, e), false, "starts exactly when existing ends");
    assert.equal(overlaps(480, 600, s, e), false, "ends exactly when existing starts");
    assert.equal(overlaps(780, 900, s, e), false, "after");
  });
  it("rounds money to cents", () => {
    assert.equal(roundMoney(65 * 1.5), 97.5);
    assert.equal(roundMoney(33.333 * 3), 100);
  });
  it("detects past slots in a given UTC offset", () => {
    const now = new Date("2030-06-10T10:00:00Z");
    assert.equal(isInPast("2030-06-09", 900, 0, now), true);
    assert.equal(isInPast("2030-06-10", 9 * 60, 0, now), true);
    assert.equal(isInPast("2030-06-10", 11 * 60, 0, now), false);
    assert.equal(isInPast("2030-06-11", 0, 0, now), false);
    // Dhaka (+6): 10:00Z is 16:00 local, so a 15:00 slot has passed but 17:00 has not
    assert.equal(isInPast("2030-06-10", 15 * 60, 360, now), true);
    assert.equal(isInPast("2030-06-10", 17 * 60, 360, now), false);
    // Crossing midnight: 22:00Z is already tomorrow in Dhaka
    assert.equal(isInPast("2030-06-10", 23 * 60, 360, new Date("2030-06-10T22:00:00Z")), true);
  });
});

describe("parseObjectId", () => {
  it("accepts 24-hex and rejects everything else (incl. 12-char strings)", () => {
    assert.equal(parseObjectId("507f1f77bcf86cd799439011").toHexString(), "507f1f77bcf86cd799439011");
    for (const bad of ["abc", "123456789012", "zzzzzzzzzzzzzzzzzzzzzzzz", "", undefined, 5, "507f1f77bcf86cd79943901"]) {
      assert.throws(() => parseObjectId(bad), /Invalid/);
    }
  });
});

describe("studio validators", () => {
  const valid = {
    title: "Test Studio", category: "Photo Studio", hourlyRate: "50", securityDeposit: "100", maxCapacity: "8",
    location: "Dhaka", imageUrl: "https://example.com/a.jpg", amenities: ["Wi-Fi", "Wi-Fi", " Lights "],
    overview: "A fully equipped studio for photo shoots.",
  };
  it("coerces numbers, dedupes amenities, defaults gallery, strips unknown keys", () => {
    const out = studioBodySchema.parse({ ...valid, ownerEmail: "evil@x.com", rating: 5 });
    assert.equal(out.hourlyRate, 50);
    assert.deepEqual(out.amenities, ["Wi-Fi", "Lights"]);
    assert.deepEqual(out.gallery, []);
    assert.ok(!("ownerEmail" in out) && !("rating" in out));
  });
  it("rejects bad data", () => {
    assert.throws(() => studioBodySchema.parse({ ...valid, category: "Nope" }));
    assert.throws(() => studioBodySchema.parse({ ...valid, hourlyRate: -1 }));
    assert.throws(() => studioBodySchema.parse({ ...valid, hourlyRate: "abc" }));
    assert.throws(() => studioBodySchema.parse({ ...valid, imageUrl: "javascript:alert(1)" }));
    assert.throws(() => studioBodySchema.parse({ ...valid, maxCapacity: 2.5 }));
    assert.throws(() => studioBodySchema.parse({ ...valid, overview: "short" }));
  });
  it("query defaults and empty-string handling", () => {
    const q = studioQuerySchema.parse({ category: "", search: "", sort: "", page: "" });
    assert.equal(q.category, undefined);
    assert.equal(q.sort, "newest");
    assert.equal(q.page, 1);
    assert.equal(q.limit, 12);
    assert.throws(() => studioQuerySchema.parse({ limit: "500" }));
  });
});

describe("booking validator", () => {
  const base = { studioId: "507f1f77bcf86cd799439011", bookingDate: "2030-01-01", startTime: "10:00", endTime: "12:00" };
  it("accepts a valid slot", () => assert.ok(createBookingSchema.parse(base)));
  it("rejects end <= start, <1h, >12h, bad formats", () => {
    assert.throws(() => createBookingSchema.parse({ ...base, endTime: "10:00" }), /after start/);
    assert.throws(() => createBookingSchema.parse({ ...base, endTime: "09:00" }), /after start/);
    assert.throws(() => createBookingSchema.parse({ ...base, endTime: "10:30" }), /Minimum/);
    assert.throws(() => createBookingSchema.parse({ ...base, startTime: "06:00", endTime: "20:00" }), /Maximum/);
    assert.throws(() => createBookingSchema.parse({ ...base, startTime: "9am" }));
    assert.throws(() => createBookingSchema.parse({ ...base, bookingDate: "2030-02-31" }));
  });
});
