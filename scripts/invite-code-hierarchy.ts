/**
 * Invite Code Hierarchy Helper
 *
 * Usage:
 *   pnpm tsx scripts/invite-code-hierarchy.ts <command> [args]
 *
 * Commands:
 *   tree <code>              - Show the hierarchy tree for a code
 *   addresses <code>         - Get all addresses under a code (recursive)
 *   add-code <code> [parent] [owner] [description] - Add a new code
 *   set-owner <code> <owner> - Set the owner taproot address for a code
 *   set-parent <code> <parent> - Set the parent code for a code
 *
 * Examples:
 *   pnpm tsx scripts/invite-code-hierarchy.ts tree WEATHER
 *   pnpm tsx scripts/invite-code-hierarchy.ts addresses WEATHER
 *   pnpm tsx scripts/invite-code-hierarchy.ts add-code WEATHER2 WEATHER bc1p... "Sub-leader code"
 *   pnpm tsx scripts/invite-code-hierarchy.ts set-owner WEATHER bc1p...
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CodeNode {
  id: string;
  code: string;
  ownerTaprootAddress: string | null;
  description: string | null;
  redemptionCount: number;
  children: CodeNode[];
}

/**
 * Recursively build the code hierarchy tree
 */
async function buildCodeTree(codeId: string): Promise<CodeNode | null> {
  const code = await prisma.inviteCode.findUnique({
    where: { id: codeId },
    include: {
      childCodes: true,
      _count: { select: { redemptions: true } },
    },
  });

  if (!code) return null;

  const children: CodeNode[] = [];
  for (const child of code.childCodes) {
    const childNode = await buildCodeTree(child.id);
    if (childNode) children.push(childNode);
  }

  return {
    id: code.id,
    code: code.code,
    ownerTaprootAddress: code.ownerTaprootAddress,
    description: code.description,
    redemptionCount: code._count.redemptions,
    children,
  };
}

/**
 * Get all code IDs in a hierarchy (recursive)
 */
async function getAllCodeIdsInHierarchy(codeId: string): Promise<string[]> {
  const ids: string[] = [codeId];

  const children = await prisma.inviteCode.findMany({
    where: { parentCodeId: codeId },
    select: { id: true },
  });

  for (const child of children) {
    const childIds = await getAllCodeIdsInHierarchy(child.id);
    ids.push(...childIds);
  }

  return ids;
}

/**
 * Get all addresses under a code hierarchy
 */
async function getAllAddressesUnderCode(code: string): Promise<{
  ownerAddresses: string[];
  redemptionAddresses: Array<{ taproot: string; segwit: string | null; code: string }>;
  totalCount: number;
}> {
  const inviteCode = await prisma.inviteCode.findUnique({
    where: { code: code.toUpperCase() },
  });

  if (!inviteCode) {
    throw new Error(`Code not found: ${code}`);
  }

  const allCodeIds = await getAllCodeIdsInHierarchy(inviteCode.id);

  // Get all codes to find owner addresses
  const allCodes = await prisma.inviteCode.findMany({
    where: { id: { in: allCodeIds } },
    select: { code: true, ownerTaprootAddress: true },
  });

  const ownerAddresses = allCodes
    .filter((c) => c.ownerTaprootAddress)
    .map((c) => c.ownerTaprootAddress!);

  // Get all redemptions under these codes
  const redemptions = await prisma.inviteCodeRedemption.findMany({
    where: { codeId: { in: allCodeIds } },
    include: { inviteCode: { select: { code: true } } },
  });

  const redemptionAddresses = redemptions.map((r) => ({
    taproot: r.taprootAddress,
    segwit: r.segwitAddress,
    code: r.inviteCode.code,
  }));

  // Combine unique addresses
  const allTaprootAddresses = new Set([
    ...ownerAddresses,
    ...redemptionAddresses.map((r) => r.taproot),
  ]);

  return {
    ownerAddresses,
    redemptionAddresses,
    totalCount: allTaprootAddresses.size,
  };
}

/**
 * Print the code tree in a visual format
 */
function printTree(node: CodeNode, indent: string = '', isLast: boolean = true): void {
  const prefix = indent + (isLast ? '└── ' : '├── ');
  const ownerInfo = node.ownerTaprootAddress
    ? ` (owner: ${node.ownerTaprootAddress.slice(0, 12)}...)`
    : '';
  const descInfo = node.description ? ` - ${node.description}` : '';

  console.log(
    `${indent === '' ? '' : prefix}${node.code}${ownerInfo} [${node.redemptionCount} redemptions]${descInfo}`
  );

  const childIndent = indent + (isLast ? '    ' : '│   ');
  node.children.forEach((child, index) => {
    printTree(child, childIndent, index === node.children.length - 1);
  });
}

/**
 * Add a new invite code
 */
async function addCode(
  code: string,
  parentCode?: string,
  ownerTaprootAddress?: string,
  description?: string
): Promise<void> {
  const upperCode = code.toUpperCase();

  let parentCodeId: string | undefined;
  if (parentCode) {
    const parent = await prisma.inviteCode.findUnique({
      where: { code: parentCode.toUpperCase() },
    });
    if (!parent) {
      throw new Error(`Parent code not found: ${parentCode}`);
    }
    parentCodeId = parent.id;
  }

  const newCode = await prisma.inviteCode.create({
    data: {
      code: upperCode,
      parentCodeId,
      ownerTaprootAddress,
      description,
    },
  });

  console.log(`Created code: ${newCode.code} (id: ${newCode.id})`);
  if (parentCode) console.log(`  Parent: ${parentCode.toUpperCase()}`);
  if (ownerTaprootAddress) console.log(`  Owner: ${ownerTaprootAddress}`);
  if (description) console.log(`  Description: ${description}`);
}

/**
 * Set owner for an existing code
 */
async function setOwner(code: string, ownerTaprootAddress: string): Promise<void> {
  const updated = await prisma.inviteCode.update({
    where: { code: code.toUpperCase() },
    data: { ownerTaprootAddress },
  });
  console.log(`Updated ${updated.code} owner to: ${ownerTaprootAddress}`);
}

/**
 * Set parent for an existing code
 */
async function setParent(code: string, parentCode: string): Promise<void> {
  const parent = await prisma.inviteCode.findUnique({
    where: { code: parentCode.toUpperCase() },
  });
  if (!parent) {
    throw new Error(`Parent code not found: ${parentCode}`);
  }

  const updated = await prisma.inviteCode.update({
    where: { code: code.toUpperCase() },
    data: { parentCodeId: parent.id },
  });
  console.log(`Updated ${updated.code} parent to: ${parentCode.toUpperCase()}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case 'tree': {
        const code = args[0];
        if (!code) {
          console.error('Usage: tree <code>');
          process.exit(1);
        }

        const inviteCode = await prisma.inviteCode.findUnique({
          where: { code: code.toUpperCase() },
        });

        if (!inviteCode) {
          console.error(`Code not found: ${code}`);
          process.exit(1);
        }

        const tree = await buildCodeTree(inviteCode.id);
        if (tree) {
          console.log('\nCode Hierarchy Tree:');
          console.log('====================');
          printTree(tree);
        }
        break;
      }

      case 'addresses': {
        const code = args[0];
        if (!code) {
          console.error('Usage: addresses <code>');
          process.exit(1);
        }

        const result = await getAllAddressesUnderCode(code);

        console.log(`\nAddresses under ${code.toUpperCase()} hierarchy:`);
        console.log('='.repeat(50));
        console.log(`\nOwner addresses (${result.ownerAddresses.length}):`);
        result.ownerAddresses.forEach((addr) => console.log(`  ${addr}`));

        console.log(`\nRedemption addresses (${result.redemptionAddresses.length}):`);
        result.redemptionAddresses.forEach((r) =>
          console.log(`  ${r.taproot} (code: ${r.code})`)
        );

        console.log(`\nTotal unique taproot addresses: ${result.totalCount}`);
        break;
      }

      case 'add-code': {
        const [code, parent, owner, ...descParts] = args;
        if (!code) {
          console.error('Usage: add-code <code> [parent] [owner] [description]');
          process.exit(1);
        }
        const description = descParts.join(' ') || undefined;
        await addCode(code, parent || undefined, owner || undefined, description);
        break;
      }

      case 'set-owner': {
        const [code, owner] = args;
        if (!code || !owner) {
          console.error('Usage: set-owner <code> <owner>');
          process.exit(1);
        }
        await setOwner(code, owner);
        break;
      }

      case 'set-parent': {
        const [code, parent] = args;
        if (!code || !parent) {
          console.error('Usage: set-parent <code> <parent>');
          process.exit(1);
        }
        await setParent(code, parent);
        break;
      }

      default:
        console.log(`
Invite Code Hierarchy Helper

Commands:
  tree <code>              - Show the hierarchy tree for a code
  addresses <code>         - Get all addresses under a code (recursive)
  add-code <code> [parent] [owner] [description] - Add a new code
  set-owner <code> <owner> - Set the owner taproot address for a code
  set-parent <code> <parent> - Set the parent code for a code

Examples:
  pnpm tsx scripts/invite-code-hierarchy.ts tree WEATHER
  pnpm tsx scripts/invite-code-hierarchy.ts addresses WEATHER
  pnpm tsx scripts/invite-code-hierarchy.ts add-code WEATHER2 WEATHER bc1p... "Sub-leader code"
        `);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
