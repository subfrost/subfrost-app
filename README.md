This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Subfrost App

A Bitcoin futures trading interface built with Next.js, integrating with the ALKANES metaprotocol via alkanes-rs.

## Features

- 🔮 **Futures Trading Interface** - View and trade ftrBTC futures on Bitcoin regtest
- 💰 **Real-time Pricing** - Market price, exercise price, and premium calculations
- 🔄 **Auto-refresh** - Live data updates every 10 seconds
- ⛏️ **Future Generation** - Create new futures via `generatefuture` RPC
- 📊 **Markets Table** - Expandable rows with position details

## Getting Started

### Prerequisites

- Node.js 18+ 
- Yarn or npm
- alkanes-rs repository set up with Docker services running

### Installation

1. **Clone and install dependencies:**
```bash
git clone <repo-url>
cd subfrost-app
yarn install
```

2. **Start the development server:**
```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 🔮 Futures Integration

The Subfrost app integrates with the ALKANES metaprotocol to provide Bitcoin futures trading functionality. This section covers setup, testing, and usage.

### Architecture

The futures integration consists of:

1. **Backend (alkanes-rs):**
   - Bitcoin Core with `generatefuture` RPC patch
   - Metashrew WASM indexer
   - Sandshrew RPC proxy (port 18888)
   - Postgres, Redis, and other services

2. **Frontend (subfrost-app):**
   - Futures trading UI at `/futures`
   - React hooks for state management (`useFutures`)
   - API routes for generating futures
   - Real-time data refresh

3. **Integration Layer:**
   - `lib/oyl/alkanes/futures.ts` - Core futures logic
   - `app/api/futures/generate-via-cli/route.ts` - CLI-based API
   - `@alkanes/ts-sdk` - TypeScript SDK for ALKANES

### Setting Up the Backend

#### 1. Clone and Build alkanes-rs

```bash
# Clone the repository
git clone <alkanes-rs-repo-url>
cd alkanes-rs

# Build the WASM indexer
chmod +x build-wasm.sh
./build-wasm.sh
# This takes 3-5 minutes
```

#### 2. Start Docker Services

```bash
# Start all services (bitcoind, metashrew, postgres, redis, etc.)
docker-compose up -d

# Wait for services to be healthy (~30 seconds)
docker-compose ps
```

All services should show "Up (healthy)".

#### 3. Verify Bitcoin Core

```bash
# Test the generatefuture RPC
curl --user bitcoinrpc:bitcoinrpc \
  --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' \
  http://localhost:18443

# Should return blockchain info with "chain": "regtest"
```

#### 4. Build the CLI

```bash
# Build alkanes-cli (if not already built)
cargo build --release

# Test CLI
./target/release/alkanes-cli -p regtest bitcoind getblockcount
# Should return the current block height
```

### Testing Futures Generation

#### Generate a Future via CLI

```bash
cd ~/alkanes-rs

# Generate a future (creates a block with protostone)
./target/release/alkanes-cli -p regtest bitcoind generatefuture

# Output:
# Generated block with future-claiming protostone
# Coinbase pays to derived address: bcrt1p5lush...
# Block hash: 5cd9ff65...
```

#### Verify the Protostone

```bash
# Get current block height
BLOCK=$(./target/release/alkanes-cli -p regtest bitcoind getblockcount)

# Get block hash
HASH=$(curl -s --user bitcoinrpc:bitcoinrpc \
  --data-binary "{\"jsonrpc\":\"1.0\",\"method\":\"getblockhash\",\"params\":[$BLOCK]}" \
  http://localhost:18443 | jq -r '.result')

# Check coinbase outputs (should have 3 outputs)
curl -s --user bitcoinrpc:bitcoinrpc \
  --data-binary "{\"jsonrpc\":\"1.0\",\"method\":\"getblock\",\"params\":[\"$HASH\",2]}" \
  http://localhost:18443 | jq '.result.tx[0].vout | length'

# Should return: 3
# 1. Payment to address (50 BTC)
# 2. Witness commitment
# 3. Protostone OP_RETURN (contains cellpack [32, 0, 77])
```

#### Inspect a Future

```bash
# Wait a few seconds for indexer to process
sleep 5

# Inspect the future at current block
BLOCK=$(./target/release/alkanes-cli -p regtest bitcoind getblockcount)
./target/release/alkanes-cli -p regtest alkanes inspect 31:$BLOCK

# Output:
# 🔍 Inspection Result for Alkane: 31:20
# └── 📏 Bytecode Length: 0 bytes
```

**Note:** Currently futures show 0 bytes bytecode. The protostone is created correctly in the coinbase, but the indexer doesn't yet deploy the future contract. This is a known limitation being investigated.

### Using the Futures UI

#### 1. Start the Subfrost App

```bash
cd ~/subfrost-app
yarn dev
```

#### 2. Open the Futures Page

Navigate to: **http://localhost:3000/futures**

You'll see:
- Current block height
- Number of available futures
- Markets table with futures data
- "Generate Future" button

#### 3. Generate a Future from UI

Click the **"Generate Future"** button. This will:
1. Call the `/api/futures/generate-via-cli` API endpoint
2. Execute `alkanes-cli bitcoind generatefuture` on the server
3. Create a new block with a protostone
4. Refresh the futures list

You should see an alert: "Future generated successfully!"

#### 4. View Futures

The Markets table displays futures with:
- **Symbol:** `ftrBTC[31:N]` where N is the block height
- **Type:** Call or Put
- **Strike Price:** Calculated based on block height
- **Expiry:** Block-based expiry
- **Market Price:** Real-time pricing
- **Positions:** Your open positions (expandable rows)

### API Endpoints

#### POST `/api/futures/generate-via-cli`

Generates a new future by executing the CLI command.

**Request:**
```bash
curl -X POST http://localhost:3000/api/futures/generate-via-cli \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**
```json
{
  "success": true,
  "blockHash": "5cd9ff65...",
  "output": "Generated block with future-claiming protostone\n..."
}
```

### Key Files

#### Core Logic
- `lib/oyl/alkanes/futures.ts` - Futures generation, fetching, claiming
- `hooks/useFutures.ts` - React hook for futures state management

#### UI Components
- `app/futures/page.tsx` - Main futures trading page
- `app/futures/components/MarketsTable.tsx` - Markets table component

#### API Routes
- `app/api/futures/generate/route.ts` - RPC-based generation (alternative)
- `app/api/futures/generate-via-cli/route.ts` - CLI-based generation (recommended)

#### Documentation
- `docs/FUTURES_INTEGRATION.md` - Complete integration guide
- `docs/FUTURES_TESTING_GUIDE.md` - Testing instructions
- `docs/FUTURES_IMPLEMENTATION_SUMMARY.md` - Technical details

### Troubleshooting

#### "Method not found" when calling generatefuture

**Problem:** The `generatefuture` RPC method doesn't exist.

**Solution:** 
1. Make sure you're using the patched Bitcoin Core from alkanes-rs
2. Verify port 18443 is exposed in docker-compose.yaml:
   ```yaml
   bitcoind:
     ports:
       - "18443:18443"
   ```
3. Rebuild bitcoind without cache:
   ```bash
   docker-compose down
   docker rmi bitcoind:alkanes
   docker-compose build --no-cache bitcoind
   docker-compose up -d
   ```

#### Futures show 0 bytes bytecode

**Problem:** The protostone is in the block but futures don't have bytecode.

**Status:** This is a known issue. The Bitcoin Core patch correctly creates protostones with cellpack [32, 0, 77], but the WASM indexer doesn't yet deploy the future contract. Investigation ongoing.

**Workaround:** The UI shows mock futures data as a fallback, so all functionality can still be tested.

#### Browser shows old cached code

**Problem:** After updating code, browser still shows old version.

**Solution:**
1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. Clear Next.js cache:
   ```bash
   rm -rf .next
   yarn dev
   ```
3. Use Incognito/Private window for testing

#### Indexer errors about missing blocks

**Problem:** Metashrew shows errors about block 401 or other high numbers.

**Solution:** The blockchain was reset but indexer database wasn't. Clear it:
```bash
cd ~/alkanes-rs
docker-compose down
docker volume rm alkanes-rs_metashrew-data
docker-compose up -d
```

### Technical Details

#### Protostone Format

The `generatefuture` RPC creates an OP_RETURN output with a Runestone containing a Protostone:

```
Hex: 6a5d090200000101a080b402

Breakdown:
- 6a         = OP_RETURN
- 5d09       = OP_PUSHDATA2, 9 bytes
- 02 00      = Pointer field (tag=2, value=0)
- 00         = Protocol field (tag=0, consumes rest)
- 01 01 a0 80 b4 02 = Cellpack [32, 0, 77] encoded as LEB128 varints
```

The cellpack `[32, 0, 77]` signals to the indexer to create a future contract at alkane ID `[31:N]` where N is the block height.

#### Future Contract IDs

Futures are stored as alkanes with ID format `[31:N]`:
- `31` = Future type identifier
- `N` = Block height where the future was created

Example: `31:20` is a future created at block 20.

#### Data Flow

1. User clicks "Generate Future" → Frontend calls API
2. API executes: `alkanes-cli -p regtest bitcoind generatefuture`
3. CLI derives frBTC signer address via simulate call
4. CLI calls Bitcoin Core `generatefuture` RPC with address
5. Bitcoin Core mines block with protostone in coinbase
6. Metashrew indexer processes block and protostone
7. Frontend refreshes and fetches updated futures list

### Current Status

✅ **Working:**
- Bitcoin Core `generatefuture` RPC functional
- Protostones created correctly in coinbase (3 outputs)
- WASM indexer built and running
- Complete UI integration
- API endpoints functional
- Auto-refresh and real-time updates

❌ **Known Issue:**
- Futures have 0 bytes bytecode (indexer doesn't deploy contracts yet)
- UI falls back to mock data

### Further Reading

- [ALKANES Metaprotocol Documentation](https://github.com/kungfuflex/alkanes-rs)
- [Runestone Specification](https://docs.ordinals.com/runes.html)
- [Bitcoin Regtest Guide](https://developer.bitcoin.org/examples/testing.html)

---

## Development

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
