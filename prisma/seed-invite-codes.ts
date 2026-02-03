/**
 * Seed script for invite codes
 *
 * Run with: pnpm db:seed:invite-codes
 *
 * This migrates the existing hardcoded invite codes to the database.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INVITE_CODES = [
  { code: 'SUBFROST2024', description: 'Original beta access code' },
  { code: 'EARLYACCESS', description: 'Early access program' },
  { code: 'FROSTBETA', description: 'Beta testing code' },
  { code: 'BITCOIN4EVER', description: 'Community code' },
];

async function main() {
  console.log('Seeding invite codes...');

  for (const { code, description } of INVITE_CODES) {
    const result = await prisma.inviteCode.upsert({
      where: { code },
      update: { description },
      create: {
        code,
        description,
        isActive: true,
      },
    });
    console.log(`  ${result.code}: ${result.id}`);
  }

  console.log(`Seeded ${INVITE_CODES.length} invite codes`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
