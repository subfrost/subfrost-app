/**
 * Seed script for invite codes
 *
 * Run with: pnpm db:seed:invite-codes
 *
 * Seeds invite codes including hierarchy examples for testing the admin panel.
 * Leader codes have child codes to demonstrate the parent/child relationship.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Top-level codes (no parent)
const ROOT_CODES = [
  { code: 'SUBFROST2024', description: 'Original beta access code' },
  { code: 'EARLYACCESS', description: 'Early access program' },
  { code: 'FROSTBETA', description: 'Beta testing code' },
  { code: 'BITCOIN4EVER', description: 'Community code' },
];

// Leader codes with child codes for hierarchy testing
const LEADER_CODES = [
  {
    code: 'LEADER-ALICE',
    description: 'Leader: Alice - Twitter campaign Feb 2026',
    ownerTaprootAddress: 'bc1p_alice_example',
    children: [
      { code: 'ALICE-001', description: 'Alice sub-code 1' },
      { code: 'ALICE-002', description: 'Alice sub-code 2' },
      { code: 'ALICE-003', description: 'Alice sub-code 3' },
    ],
  },
  {
    code: 'LEADER-BOB',
    description: 'Leader: Bob - Discord campaign Feb 2026',
    ownerTaprootAddress: 'bc1p_bob_example',
    children: [
      { code: 'BOB-001', description: 'Bob sub-code 1' },
      { code: 'BOB-002', description: 'Bob sub-code 2' },
    ],
  },
];

async function main() {
  console.log('Seeding invite codes...');

  // Seed root codes
  for (const { code, description } of ROOT_CODES) {
    const result = await prisma.inviteCode.upsert({
      where: { code },
      update: { description },
      create: { code, description, isActive: true },
    });
    console.log(`  ${result.code}: ${result.id}`);
  }

  // Seed leader codes with children
  for (const leader of LEADER_CODES) {
    const parent = await prisma.inviteCode.upsert({
      where: { code: leader.code },
      update: { description: leader.description, ownerTaprootAddress: leader.ownerTaprootAddress },
      create: {
        code: leader.code,
        description: leader.description,
        ownerTaprootAddress: leader.ownerTaprootAddress,
        isActive: true,
      },
    });
    console.log(`  ${parent.code}: ${parent.id} (leader)`);

    for (const child of leader.children) {
      const result = await prisma.inviteCode.upsert({
        where: { code: child.code },
        update: { description: child.description, parentCodeId: parent.id },
        create: {
          code: child.code,
          description: child.description,
          parentCodeId: parent.id,
          isActive: true,
        },
      });
      console.log(`    ${result.code}: ${result.id} (child of ${parent.code})`);
    }
  }

  const total = ROOT_CODES.length + LEADER_CODES.length + LEADER_CODES.reduce((n, l) => n + l.children.length, 0);
  console.log(`Seeded ${total} invite codes`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
