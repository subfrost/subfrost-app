/**
 * Seed script: creates initial admin user and migrates hardcoded FUEL allocations.
 *
 * Usage:
 *   ADMIN_SEED_PASSWORD="yourpassword" DATABASE_URL="..." npx tsx prisma/seed-admin.ts
 *
 * Environment variables:
 *   DATABASE_URL          — PostgreSQL connection string (required)
 *   ADMIN_SEED_USERNAME   — Admin username (default: "gabe")
 *   ADMIN_SEED_PASSWORD   — Admin password (required, min 8 chars)
 *   ADMIN_SEED_DISPLAY    — Display name (default: username)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Create admin user with iam.owner
  const username = (process.env.ADMIN_SEED_USERNAME || 'gabe').trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  const displayName = process.env.ADMIN_SEED_DISPLAY || username.charAt(0).toUpperCase() + username.slice(1);

  if (!password || password.length < 8) {
    console.error('Error: ADMIN_SEED_PASSWORD env var is required (min 8 characters)');
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin user "${username}" already exists (id=${existing.id}), skipping.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        displayName,
        permissions: ['iam.owner'],
      },
    });
    console.log(`Created admin user "${username}" (id=${user.id}) with iam.owner`);
  }

  // 2. Migrate hardcoded FUEL allocations
  const allocations = [
    {
      address: 'bc1p3692m0sd6nq5mv4uq0yz2laet3r0asw8kpkrdunkk8ddk045nxzsl2vdsq',
      amount: 1901,
      note: 'Migrated from hardcoded data',
    },
    {
      address: 'bc1pyvt8gmk7uznk5y7x96rnsawg6w4jmgx8ggkcj9du5ar7arns2rzsu9hne7',
      amount: 867,
      note: 'Migrated from hardcoded data',
    },
  ];

  for (const alloc of allocations) {
    const result = await prisma.fuelAllocation.upsert({
      where: { address: alloc.address },
      create: alloc,
      update: { amount: alloc.amount, note: alloc.note },
    });
    console.log(`FUEL allocation: ${alloc.address.slice(0, 14)}... = ${alloc.amount} (id=${result.id})`);
  }

  console.log('\nSeed complete.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error('Seed failed:', e);
    prisma.$disconnect();
    process.exit(1);
  });
