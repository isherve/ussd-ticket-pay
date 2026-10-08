import type { Event } from "@prisma/client";
import { startCheckout } from "./payments/service.js";
import { prisma } from "./db.js";
import { sendToWallet, splitWallet, topUp } from "./wallet/service.js";

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

const demoPhone = "+250788123456";

async function demoTicket(eventId: string, idempotencyKey: string): Promise<void> {
  await startCheckout({
    phone: demoPhone,
    eventId,
    quantity: 1,
    provider: "wallet",
    idempotencyKey,
  });
}

export async function ensureDemoWallet(): Promise<void> {
  const already = await prisma.transfer.findUnique({ where: { idempotencyKey: "seed-deposit-1" } });
  if (already) return;
  const owner = await prisma.user.findUnique({
    where: { phone: demoPhone },
    include: { wallet: true },
  });
  if ((owner?.wallet?.balanceRwf ?? 0) > 0) return;

  const event = await prisma.event.findUnique({ where: { slug: "jazz-night" } });
  if (!event) return;

  await topUp({ phone: demoPhone, amountRwf: 15_000, idempotencyKey: "seed-deposit-1" });
  await demoTicket(event.id, "seed-ticket-1");
  await topUp({ phone: demoPhone, amountRwf: 7_000, idempotencyKey: "seed-deposit-2" });
  await sendToWallet({
    fromPhone: demoPhone,
    toPhone: "+250788999111",
    amountRwf: 2500,
    idempotencyKey: "seed-send-1",
  });
  await splitWallet({
    fromPhone: demoPhone,
    amountRwf: 5000,
    phones: ["+250728999222", "+250728999333"],
    idempotencyKey: "seed-split-1",
  });
  await demoTicket(event.id, "seed-ticket-2");
}
