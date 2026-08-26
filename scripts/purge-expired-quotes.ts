/**
 * Retention job: deletes submitted quote requests past their purge date.
 * Audit events and export records survive — they hold no calculator result.
 * Run on a schedule (cron / platform scheduler): `npm run db:purge`.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const expired = await prisma.quoteRequest.findMany({
    where: { purgeAfter: { lt: now } },
    select: { id: true, ref: true, clientName: true },
  });

  for (const quote of expired) {
    await prisma.exportRecord.updateMany({ where: { quoteId: quote.id }, data: { quoteId: null } });
    await prisma.quoteRequest.delete({ where: { id: quote.id } });
    await prisma.auditEvent.create({
      data: {
        action: "QUOTE_PURGED",
        entity: "QuoteRequest",
        entityId: quote.id,
        summary: `${quote.ref} (${quote.clientName}) purged after its retention period`,
      },
    });
  }

  console.log(`Purged ${expired.length} expired quote request(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
