import { prisma } from "../src/db.js";
import { ensureSeed } from "../src/seed.js";

const seeded = await ensureSeed();
console.log(`Seeded ${seeded.length} events`);
await prisma.$disconnect();
