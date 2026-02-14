#!/usr/bin/env node

/**
 * Subfrost Admin CLI
 *
 * Manages invite codes and redemptions via the NextJS admin API routes.
 *
 * Environment:
 *   ADMIN_SECRET  — Required. The shared secret for /api/admin/* routes.
 *
 * Usage:
 *   ./bin/cli.js list-codes [--search <term>] [--page <n>]
 *   ./bin/cli.js list-redemptions [--search <term>] [--page <n>]
 *   ./bin/cli.js create-code <code> [--description <desc>] [--owner <address>] [--parent-code <code>]
 *   ./bin/cli.js redeem <code> <taproot-address>
 *   ./bin/cli.js add-leader <code> <taproot-address> [--description <desc>] [--parent-code <code>]
 *   ./bin/cli.js batch-add-leaders <json-file>
 *   ./bin/cli.js stats
 *
 * Options:
 *   --base-url <url>   API base URL (default: https://app.subfrost.io)
 *   --dry-run          Show what would be done without calling APIs
 */

const BASE_URL_DEFAULT = 'https://app.subfrost.io';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSecret() {
  const s = process.env.ADMIN_SECRET;
  if (!s) {
    console.error('Error: ADMIN_SECRET environment variable is not set.');
    console.error('Export it in your shell:  export ADMIN_SECRET=<value>');
    process.exit(1);
  }
  return s;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      // Boolean flags (no value)
      if (key === 'dry-run') {
        flags[key] = true;
        continue;
      }
      const val = args[i + 1];
      if (!val || val.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = val;
        i++;
      }
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

async function api(baseUrl, method, path, body, secret) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-admin-secret'] = secret;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok && res.status !== 409) {
    const msg = json.error || json.raw || res.statusText;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return { status: res.status, data: json };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function listCodes(baseUrl, secret, flags) {
  const params = new URLSearchParams();
  if (flags.search) params.set('search', flags.search);
  if (flags.page) params.set('page', flags.page);
  if (flags.limit) params.set('limit', flags.limit);
  const qs = params.toString();

  const { data } = await api(baseUrl, 'GET', `/api/admin/codes${qs ? '?' + qs : ''}`, null, secret);
  const { codes, pagination } = data;

  console.log(`\nCodes (page ${pagination.page}/${pagination.totalPages}, ${pagination.total} total):\n`);
  console.log('  Code                 Owner                              Redemptions  Children  Parent');
  console.log('  ' + '-'.repeat(100));
  for (const c of codes) {
    const owner = c.ownerTaprootAddress ? c.ownerTaprootAddress.slice(0, 20) + '...' : '(none)';
    const parent = c.parentCode ? c.parentCode.code : '-';
    console.log(
      `  ${c.code.padEnd(20)} ${owner.padEnd(34)} ${String(c._count.redemptions).padEnd(12)} ${String(c._count.childCodes).padEnd(9)} ${parent}`
    );
  }
  console.log();
}

async function listRedemptions(baseUrl, secret, flags) {
  const params = new URLSearchParams();
  if (flags.search) params.set('search', flags.search);
  if (flags.page) params.set('page', flags.page);
  const qs = params.toString();

  const { data } = await api(baseUrl, 'GET', `/api/admin/redemptions${qs ? '?' + qs : ''}`, null, secret);
  const { redemptions, pagination } = data;

  console.log(`\nRedemptions (page ${pagination.page}/${pagination.totalPages}, ${pagination.total} total):\n`);
  console.log('  Code                 Taproot Address                                                      Date');
  console.log('  ' + '-'.repeat(100));
  for (const r of redemptions) {
    const date = new Date(r.redeemedAt).toISOString().slice(0, 10);
    console.log(`  ${(r.code?.code || r.codeId).toString().padEnd(20)} ${r.taprootAddress.padEnd(66)} ${date}`);
  }
  console.log();
}

async function showStats(baseUrl, secret) {
  const { data } = await api(baseUrl, 'GET', '/api/admin/stats', null, secret);
  console.log('\nDashboard Stats:');
  console.log(`  Total codes:       ${data.totalCodes}`);
  console.log(`  Active codes:      ${data.activeCodes}`);
  console.log(`  Total redemptions: ${data.totalRedemptions}`);
  console.log(`  Total users:       ${data.totalUsers}`);
  if (data.topCodes?.length) {
    console.log('\n  Top codes:');
    for (const tc of data.topCodes) {
      console.log(`    ${tc.code.padEnd(20)} ${tc._count.redemptions} redemptions`);
    }
  }
  console.log();
}

/**
 * Look up a parent code by name and return its database ID.
 */
async function resolveParentCodeId(baseUrl, secret, parentCodeName) {
  const { data } = await api(
    baseUrl, 'GET',
    `/api/admin/codes?search=${encodeURIComponent(parentCodeName)}&limit=100`,
    null, secret
  );
  const match = data.codes.find((c) => c.code === parentCodeName.toUpperCase());
  if (!match) {
    throw new Error(`Parent code "${parentCodeName}" not found in database`);
  }
  return match.id;
}

async function createCode(baseUrl, secret, code, opts = {}, dryRun = false) {
  const body = { code };
  if (opts.description) body.description = opts.description;
  if (opts.ownerTaprootAddress) body.ownerTaprootAddress = opts.ownerTaprootAddress;
  if (opts.parentCodeId) body.parentCodeId = opts.parentCodeId;

  if (dryRun) {
    console.log(`  [dry-run] Would create code: ${code.toUpperCase()}`);
    if (opts.description) console.log(`            description: ${opts.description}`);
    if (opts.ownerTaprootAddress) console.log(`            owner: ${opts.ownerTaprootAddress}`);
    if (opts.parentCodeId) console.log(`            parentCodeId: ${opts.parentCodeId}`);
    return { status: 'dry-run' };
  }

  const { status, data } = await api(baseUrl, 'POST', '/api/admin/codes', body, secret);
  if (status === 409) {
    console.log(`  [skip] Code ${data.code || code.toUpperCase()} already exists`);
    return { status: 'exists', data };
  }
  console.log(`  [created] Code ${data.code} (id: ${data.id})`);
  return { status: 'created', data };
}

async function redeemCode(baseUrl, code, taprootAddress, dryRun = false) {
  if (dryRun) {
    console.log(`  [dry-run] Would redeem code ${code.toUpperCase()} for ${taprootAddress}`);
    return { status: 'dry-run' };
  }

  // Redeem endpoint is public (no admin auth needed)
  const { status, data } = await api(baseUrl, 'POST', '/api/invite-codes/redeem', {
    code,
    taprootAddress,
  });
  if (data.success) {
    console.log(`  [redeemed] ${code.toUpperCase()} → ${taprootAddress.slice(0, 20)}... (user: ${data.userId})`);
  } else {
    console.log(`  [redeem-info] ${code.toUpperCase()}: ${data.error}`);
  }
  return { status: data.success ? 'redeemed' : 'info', data };
}

/**
 * Combined: create code + redeem it for the address.
 */
async function addLeader(baseUrl, secret, code, address, opts = {}, dryRun = false) {
  console.log(`\n  Adding leader: ${code.toUpperCase()} → ${address}`);

  // Step 1: Resolve parent code if specified by name
  let parentCodeId = null;
  if (opts.parentCode) {
    parentCodeId = await resolveParentCodeId(baseUrl, secret, opts.parentCode);
    if (!dryRun) console.log(`  [resolved] Parent "${opts.parentCode}" → ${parentCodeId}`);
  }

  // Step 2: Create the code
  await createCode(baseUrl, secret, code, {
    description: opts.description || null,
    ownerTaprootAddress: address,
    parentCodeId,
  }, dryRun);

  // Step 3: Redeem code for address
  await redeemCode(baseUrl, code, address, dryRun);
}

async function batchAddLeaders(baseUrl, secret, filePath, dryRun = false) {
  const fs = await import('fs');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const entries = JSON.parse(raw);

  if (!Array.isArray(entries)) {
    throw new Error('JSON file must contain an array of { code, address, description?, parentCode? }');
  }

  console.log(`\nBatch importing ${entries.length} leaders${dryRun ? ' (DRY RUN)' : ''}...`);

  let created = 0, skipped = 0, redeemed = 0, errors = 0;
  for (const entry of entries) {
    try {
      await addLeader(baseUrl, secret, entry.code, entry.address, {
        description: entry.description,
        parentCode: entry.parentCode,
      }, dryRun);
      created++;
      redeemed++;
    } catch (err) {
      console.error(`  [error] ${entry.code}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Created: ${created}, Errors: ${errors}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { positional, flags } = parseArgs(process.argv);
  const command = positional[0];
  const baseUrl = flags['base-url'] || BASE_URL_DEFAULT;
  const dryRun = !!flags['dry-run'];

  if (!command || command === 'help' || flags.help) {
    console.log(`
Subfrost Admin CLI

Usage:
  ./bin/cli.js <command> [options]

Commands:
  list-codes [--search <term>] [--page <n>]           List invite codes
  list-redemptions [--search <term>] [--page <n>]     List redemptions
  stats                                                Show dashboard stats
  create-code <code> [options]                         Create an invite code
  redeem <code> <taproot-address>                      Record a redemption
  add-leader <code> <address> [options]                Create code + redeem
  batch-add-leaders <json-file>                        Batch import from JSON

Options:
  --base-url <url>       API base URL (default: ${BASE_URL_DEFAULT})
  --description <desc>   Description for the code
  --parent-code <code>   Parent code name (resolved to ID automatically)
  --owner <address>      Owner taproot address (for create-code)
  --dry-run              Show what would be done without calling APIs
  --help                 Show this help message

Environment:
  ADMIN_SECRET           Required. Admin secret for API authentication.
`);
    process.exit(0);
  }

  const secret = getSecret();

  switch (command) {
    case 'list-codes':
      await listCodes(baseUrl, secret, flags);
      break;

    case 'list-redemptions':
      await listRedemptions(baseUrl, secret, flags);
      break;

    case 'stats':
      await showStats(baseUrl, secret);
      break;

    case 'create-code': {
      const code = positional[1];
      if (!code) {
        console.error('Usage: create-code <code> [--description <desc>] [--owner <addr>] [--parent-code <code>]');
        process.exit(1);
      }
      let parentCodeId = null;
      if (flags['parent-code']) {
        parentCodeId = await resolveParentCodeId(baseUrl, secret, flags['parent-code']);
      }
      await createCode(baseUrl, secret, code, {
        description: flags.description,
        ownerTaprootAddress: flags.owner,
        parentCodeId,
      }, dryRun);
      break;
    }

    case 'redeem': {
      const code = positional[1];
      const addr = positional[2];
      if (!code || !addr) {
        console.error('Usage: redeem <code> <taproot-address>');
        process.exit(1);
      }
      await redeemCode(baseUrl, code, addr, dryRun);
      break;
    }

    case 'add-leader': {
      const code = positional[1];
      const addr = positional[2];
      if (!code || !addr) {
        console.error('Usage: add-leader <code> <address> [--description <desc>] [--parent-code <code>]');
        process.exit(1);
      }
      await addLeader(baseUrl, secret, code, addr, {
        description: flags.description,
        parentCode: flags['parent-code'],
      }, dryRun);
      break;
    }

    case 'batch-add-leaders': {
      const file = positional[1];
      if (!file) {
        console.error('Usage: batch-add-leaders <json-file>');
        process.exit(1);
      }
      await batchAddLeaders(baseUrl, secret, file, dryRun);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run ./bin/cli.js help for usage.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
