import type { Event } from "@prisma/client";
import { prisma } from "./db.js";

export const sampleEvents: Array<{
  slug: string;
  name: string;
  shortName: string;
  venue: string;
  startsAt: Date;
  priceRwf: number;
  capacity: number;
}> = [
  {
    slug: "jazz-night",
    name: "Kigali Jazz Night",
    shortName: "Jazz Night",
    venue: "Kigali Arena",
    startsAt: new Date("2026-11-14T18:00:00.000Z"),
    priceRwf: 5000,
    capacity: 200,
  },
  {
    slug: "umuganura",
    name: "Umuganura Festival",
    shortName: "Umuganura",
    venue: "Amahoro Stadium",
    startsAt: new Date("2026-11-21T10:00:00.000Z"),
    priceRwf: 3000,
    capacity: 500,
  },
  {
    slug: "amavubi",
    name: "Amavubi Friendly",
    shortName: "Amavubi",
    venue: "Amahoro Stadium",
    startsAt: new Date("2026-12-05T15:00:00.000Z"),
    priceRwf: 8000,
    capacity: 1000,
  },
  {
    slug: "arts-fest",
    name: "Nyamirambo Arts Fest",
    shortName: "Arts Fest",
    venue: "Nyamirambo",
    startsAt: new Date("2026-12-12T14:00:00.000Z"),
    priceRwf: 2000,
    capacity: 150,
  },
];

export async function ensureSeed(): Promise<Event[]> {
  const saved: Event[] = [];
  for (const event of sampleEvents) {
    saved.push(
      await prisma.event.upsert({
        where: { slug: event.slug },
        update: {
          name: event.name,
          shortName: event.shortName,
          venue: event.venue,
          startsAt: event.startsAt,
          priceRwf: event.priceRwf,
          capacity: event.capacity,
          active: true,
        },
        create: event,
      }),
    );
  }
  return saved;
}
