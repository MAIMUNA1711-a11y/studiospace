/**
 * Seeds demo studios + reviews owned by a fictional host so the home/explore pages have content.
 * Idempotent: removes previous seed data (identified by SEED_HOST_EMAIL) before inserting.
 * Usage: npm run seed
 *
 * NOTE: image URLs below are Unsplash links. Verify each one loads and swap any that don't
 * before you submit.
 */
import { closeDb, connectDb, ensureIndexes, reviews, studios } from "../config/db";
import type { ReviewDoc, StudioDoc } from "../types";

const SEED_HOST_EMAIL = "seed-host@studiospace.example";
const u = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1400&q=80`;

type Seed = Omit<StudioDoc, "_id" | "ownerId" | "ownerName" | "ownerEmail" | "ownerImage" | "rating" | "reviewCount" | "createdAt" | "updatedAt"> & { ratings: number[] };

const SEEDS: Seed[] = [
  {
    title: "Northlight Cyclorama Studio", category: "Photo Studio", hourlyRate: 65, securityDeposit: 150, maxCapacity: 12,
    location: "Banani, Dhaka", imageUrl: u("photo-1516035069371-29a1b244cc32"), gallery: [u("photo-1471341971476-ae15ff5dd4ea"), u("photo-1452587925148-ce544e77e70d")],
    amenities: ["Infinity cyc wall", "Strobe lighting kit", "Backdrop rolls", "Makeup station", "Air conditioning", "Free Wi-Fi"],
    overview: "A bright 1,200 sq ft photo studio with a seamless white cyclorama wall, north-facing windows and a full strobe kit. Ideal for e-commerce shoots, portraits and lookbooks. Power, light stands and a changing room are included in the hourly rate.",
    ratings: [5, 5, 4],
  },
  {
    title: "Harbor Sound Stage A", category: "Sound Stage", hourlyRate: 140, securityDeposit: 500, maxCapacity: 40,
    location: "Gulshan 2, Dhaka", imageUrl: u("photo-1478720568477-152d9b164e26"), gallery: [u("photo-1485846234645-a62644f84728")],
    amenities: ["Soundproofed walls", "3-phase power", "Grid rigging", "Green screen", "Loading dock", "Green room"],
    overview: "A 3,000 sq ft acoustically treated stage with a 20 ft ceiling, lighting grid and loading dock access. Built for commercials, short films and music videos. Crew parking and a private green room are available on site.",
    ratings: [5, 4, 5, 4],
  },
  {
    title: "Echo Room Podcast Lounge", category: "Podcast Room", hourlyRate: 35, securityDeposit: 50, maxCapacity: 4,
    location: "Dhanmondi, Dhaka", imageUrl: u("photo-1478737270239-2f02b77fc618"), gallery: [u("photo-1590602847861-f357a9332bbc")],
    amenities: ["Four Shure SM7B mics", "Audio interface", "Acoustic panels", "Video recording", "Comfortable seating"],
    overview: "A cosy treated room set up for up to four hosts with broadcast microphones, headphone monitoring and optional multi-camera video. Book a one-hour session or a full-day recording block. A technician can be added on request.",
    ratings: [5, 5],
  },
  {
    title: "Velvet Tone Music Suite", category: "Music Suite", hourlyRate: 55, securityDeposit: 100, maxCapacity: 8,
    location: "Uttara, Dhaka", imageUrl: u("photo-1598488035139-bdbb2231ce04"), gallery: [u("photo-1519683109079-d5f539e1542f")],
    amenities: ["Vocal booth", "Studio monitors", "Upright piano", "MIDI keyboard", "Drum kit", "Mixing desk"],
    overview: "A two-room recording suite with an isolated vocal booth, live room and a control room with a mixing desk. Perfect for demo sessions, vocal tracking and small band rehearsals. Instruments listed under amenities are included.",
    ratings: [4, 5, 4],
  },
  {
    title: "Clay & Canvas Art Workshop", category: "Art Workshop", hourlyRate: 28, securityDeposit: 40, maxCapacity: 16,
    location: "Mirpur DOHS, Dhaka", imageUrl: u("photo-1460661419201-fd4cecdf8a8b"), gallery: [u("photo-1513364776144-60967b0f800f")],
    amenities: ["Easels", "Pottery wheels", "Kiln access", "Sink stations", "Storage lockers", "Natural daylight"],
    overview: "A flexible workshop floor with easels, pottery wheels and a shared kiln, flooded with natural light. Suited to classes, group painting sessions and small makers' pop-ups. Cleaning is included; materials are not.",
    ratings: [4, 4, 5],
  },
  {
    title: "Monochrome Loft Studio", category: "Photo Studio", hourlyRate: 80, securityDeposit: 200, maxCapacity: 15,
    location: "Baridhara, Dhaka", imageUrl: u("photo-1471341971476-ae15ff5dd4ea"), gallery: [],
    amenities: ["Exposed brick set", "Natural light windows", "Continuous LED lights", "Props library", "Kitchenette"],
    overview: "A converted industrial loft with exposed brick, tall windows and a props library for editorial and lifestyle work. Two distinct sets are available without extra fees. Perfect for fashion shoots and brand content days.",
    ratings: [5, 4],
  },
  {
    title: "Pulse Rehearsal & Recording Room", category: "Music Suite", hourlyRate: 40, securityDeposit: 80, maxCapacity: 10,
    location: "Mohammadpur, Dhaka", imageUrl: u("photo-1519683109079-d5f539e1542f"), gallery: [],
    amenities: ["Backline amps", "Drum kit", "PA system", "Air conditioning", "Parking"],
    overview: "A soundproofed rehearsal room with a full backline and PA system, ready for band practice or live-room recording. Sessions run in flexible hourly blocks with early-morning and late-night availability.",
    ratings: [4, 4],
  },
  {
    title: "Studio Nine Film Stage", category: "Sound Stage", hourlyRate: 110, securityDeposit: 400, maxCapacity: 30,
    location: "Tejgaon, Dhaka", imageUrl: u("photo-1485846234645-a62644f84728"), gallery: [],
    amenities: ["Black-box setup", "LED panel lights", "Teleprompter", "Monitor wall", "Craft services area"],
    overview: "A black-box film stage with LED panel lighting, a teleprompter and a client monitor wall. Great for interviews, branded content and short narrative productions. Set-building is allowed with prior approval from the host.",
    ratings: [5, 5, 4],
  },
];

const REVIEWERS = ["Amina R.", "Tanvir H.", "Nusrat J.", "Rafi K."];
const COMMENTS: Record<number, string> = {
  5: "Exactly as described. The space was spotless and the host was very responsive.",
  4: "Great space and easy booking. A couple of small things to improve but I would book again.",
};

async function main() {
  await connectDb();
  await ensureIndexes();

  const old = await studios().find({ ownerEmail: SEED_HOST_EMAIL }, { projection: { _id: 1 } }).toArray();
  if (old.length) {
    await reviews().deleteMany({ studioId: { $in: old.map((s) => s._id) } });
    await studios().deleteMany({ ownerEmail: SEED_HOST_EMAIL });
  }

  const base = Date.now();
  for (const [i, { ratings, ...seed }] of SEEDS.entries()) {
    const createdAt = new Date(base - (SEEDS.length - i) * 86_400_000);
    const avg = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
    const { insertedId } = await studios().insertOne({
      ...seed,
      ownerId: "seed-host",
      ownerName: "StudioSpace Demo Host",
      ownerEmail: SEED_HOST_EMAIL,
      rating: avg,
      reviewCount: ratings.length,
      createdAt,
      updatedAt: createdAt,
    } as StudioDoc);

    const docs = ratings.map((rating, j) => ({
      studioId: insertedId,
      userId: `seed-reviewer-${j}`,
      userEmail: `seed-reviewer-${j}-${i}@studiospace.example`,
      userName: REVIEWERS[j % REVIEWERS.length],
      rating,
      comment: COMMENTS[rating] ?? COMMENTS[4],
      createdAt: new Date(createdAt.getTime() + (j + 1) * 3_600_000),
    })) as ReviewDoc[];
    await reviews().insertMany(docs);
  }

  console.log(`Seeded ${SEEDS.length} studios for ${SEED_HOST_EMAIL}`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
