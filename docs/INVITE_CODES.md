# Invite Code System

This document describes how to manage invite codes for the Subfrost app.

## Overview

Invite codes are optional codes users can enter during wallet creation. When redeemed, the code is associated with the user's wallet address in the database for tracking purposes.

## Database Schema

```
InviteCode
├── id (cuid)
├── code (unique, uppercase)
├── description (optional admin note)
├── isActive (boolean, default true)
└── createdAt

InviteCodeRedemption
├── id (cuid)
├── codeId (foreign key)
├── taprootAddress
├── segwitAddress (optional)
├── taprootPubkey (optional)
└── redeemedAt
```

## Adding New Invite Codes

### Option 1: Prisma Studio (GUI)

```bash
pnpm db:studio
```

This opens a web interface at `http://localhost:5555`. Navigate to the `InviteCode` table and click "Add record".

### Option 2: Direct SQL

Connect to your PostgreSQL database and run:

```sql
INSERT INTO invite_codes (id, code, description, is_active, created_at)
VALUES (
  'clxx...',  -- Generate a cuid or use gen_random_uuid()
  'NEWCODE2026',
  'Marketing campaign Q1 2026',
  true,
  NOW()
);
```

### Option 3: Prisma Script

Create a script or use the Node REPL:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

await prisma.inviteCode.create({
  data: {
    code: 'NEWCODE2026',
    description: 'Marketing campaign Q1 2026',
    isActive: true,
  },
});
```

### Option 4: Seed Script

Add codes to `prisma/seed-invite-codes.ts`:

```typescript
const INVITE_CODES = [
  { code: 'SUBFROST2024', description: 'Original beta access code' },
  { code: 'EARLYACCESS', description: 'Early access program' },
  { code: 'NEWCODE2026', description: 'Your new code' },  // Add here
];
```

Then run:

```bash
pnpm db:seed:invite-codes
```

## Deactivating Codes

To deactivate a code without deleting it:

```sql
UPDATE invite_codes SET is_active = false WHERE code = 'OLDCODE';
```

Or via Prisma:

```typescript
await prisma.inviteCode.update({
  where: { code: 'OLDCODE' },
  data: { isActive: false },
});
```

## Viewing Redemptions

### All redemptions for a specific code

```sql
SELECT
  ic.code,
  icr.taproot_address,
  icr.redeemed_at
FROM invite_code_redemptions icr
JOIN invite_codes ic ON ic.id = icr.code_id
WHERE ic.code = 'SUBFROST2024'
ORDER BY icr.redeemed_at DESC;
```

### Redemption counts per code

```sql
SELECT
  ic.code,
  ic.description,
  COUNT(icr.id) as redemption_count
FROM invite_codes ic
LEFT JOIN invite_code_redemptions icr ON ic.id = icr.code_id
GROUP BY ic.id, ic.code, ic.description
ORDER BY redemption_count DESC;
```

### Check if a wallet used any code

```sql
SELECT
  ic.code,
  icr.redeemed_at
FROM invite_code_redemptions icr
JOIN invite_codes ic ON ic.id = icr.code_id
WHERE icr.taproot_address = 'bc1p...';
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invite-codes/validate` | POST | Check if a code is valid |
| `/api/invite-codes/redeem` | POST | Record a wallet's use of a code |

### Validate Request

```json
POST /api/invite-codes/validate
{
  "code": "SUBFROST2024"
}
```

### Validate Response

```json
{
  "valid": true
}
```

Or on error:

```json
{
  "valid": false,
  "error": "Invalid invite code"
}
```

### Redeem Request

```json
POST /api/invite-codes/redeem
{
  "code": "SUBFROST2024",
  "taprootAddress": "bc1p...",
  "segwitAddress": "bc1q...",
  "taprootPubkey": "02..."
}
```

## Code Naming Conventions

- Use **UPPERCASE** letters and numbers only
- Keep codes **8-16 characters** for easy entry
- Use descriptive prefixes for campaigns:
  - `TWITTER2026` - Twitter/X campaigns
  - `PARTNER_ACME` - Partner referrals
  - `EVENT_BTC26` - Conference/event codes
  - `BETA_*` - Beta testing codes

## Local Development

Start local PostgreSQL:

```bash
docker-compose up -d postgres
```

Push schema and seed codes:

```bash
pnpm db:push
pnpm db:seed:invite-codes
```

Test validation:

```bash
curl -X POST http://localhost:3000/api/invite-codes/validate \
  -H "Content-Type: application/json" \
  -d '{"code": "SUBFROST2024"}'
```
