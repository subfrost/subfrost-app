/**
 * Seed script: creates initial admin user and migrates hardcoded FUEL allocations.
 *
 * Usage: source ~/.bestaryenv && npx tsx prisma/seed-admin.ts
 * Or: DATABASE_URL="..." npx tsx prisma/seed-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Create "gabe" admin user with iam.owner
  const username = 'gabe';
  const password = 'SubFr0st!Adm1n2026';

  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin user "${username}" already exists (id=${existing.id}), skipping.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.adminUser.create({
      data: {
        username,
        passwordHash,
        displayName: 'Gabe',
        permissions: ['iam.owner'],
      },
    });
    console.log(`Created admin user "${username}" (id=${user.id}) with iam.owner`);
    console.log(`Password: ${password}`);
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
