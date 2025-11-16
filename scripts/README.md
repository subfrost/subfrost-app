# Subfrost Regtest Deployment Scripts

## Overview

This directory contains scripts for deploying and managing the Subfrost alkanes environment on a Bitcoin regtest network.

## Prerequisites

### 1. Start Regtest Node

The regtest node must be running before deployment:

```bash
cd reference/alkanes-rs
docker-compose up -d
```

This starts:
- Bitcoin Core regtest node on `localhost:18888`
- Alkanes indexer
- All necessary services

### 2. Build alkanes-cli

```bash
cd reference/alkanes-rs
cargo build --release
```

The CLI will be at: `reference/alkanes-rs/target/release/alkanes-cli`

### 3. Build All WASMs

From the project root:

```bash
cargo build --release --target wasm32-unknown-unknown
```

This builds all contract WASMs to: `target/wasm32-unknown-unknown/release/`

## Deployment Script

### Usage

```bash
./reference/subfrost-app/scripts/deploy-regtest-environment.sh
```

### What It Does

The script performs the following steps:

#### 1. Dependency Check
- Verifies `alkanes-cli` is built
- Checks regtest node is running on `localhost:18888`
- Validates all required WASMs are built

#### 2. Wallet Setup
- Creates a new wallet if needed (stored in `~/.alkanes/regtest-wallet.json`)
- Uses existing wallet if already created
- Displays wallet address for funding

#### 3. Wallet Funding
- Checks current balance
- If balance < 10 BTC, generates blocks to wallet address (regtest only)
- Syncs wallet with blockchain

#### 4. Contract Deployment

Deploys all Subfrost contracts in the correct order:

##### LBTC System
- **FROST Token** `[4, 10]` - Governance token (10M supply)
- **pLBTC** `[4, 11]` - Principal LBTC
- **yxLBTC** `[4, 12]` - Yield LBTC
- **LBTC Yield Splitter** `[4, 13]` - Splits LBTC into pLBTC + yxLBTC
- **Synth Pool** `[4, 30]` - pLBTC/frBTC stableswap (A=100, fee=0.04%)

##### Governance System
- **vxFROST Gauge** `[4, 50]` - Gauge for FROST incentives

##### Futures System
- **dxBTC Vault** `[4, 0]` - Leveraged frBTC vault

##### Vault System
- **veDIESEL Vault** `[4, 60]` - Vote-escrowed DIESEL vault

##### Genesis Contracts (Pre-deployed)
- **DIESEL** `[2, 0]` - Genesis alkane
- **frBTC** `[32, 0]` - Wrapped BTC
- **ftrBTC Master** `[31, 0]` - Futures master contract

#### 5. Verification
- Checks all contracts are deployed correctly
- Verifies genesis contracts are available

#### 6. Test State Setup
- Validates initial token balances
- Confirms contracts are ready for interaction

#### 7. Summary Display
- Shows all deployed contract addresses
- Provides example commands
- Displays wallet information

## Contract Addresses

After deployment, contracts will be available at these addresses:

| Contract | Address | Description |
|----------|---------|-------------|
| FROST Token | [4, 10] | Governance token |
| pLBTC | [4, 11] | Principal LBTC |
| yxLBTC | [4, 12] | Yield LBTC |
| LBTC Yield Splitter | [4, 13] | Splits LBTC |
| Synth Pool | [4, 30] | pLBTC/frBTC AMM |
| vxFROST Gauge | [4, 50] | Gauge contract |
| dxBTC Vault | [4, 0] | Futures vault |
| veDIESEL Vault | [4, 60] | Vote-escrowed vault |
| DIESEL | [2, 0] | Genesis (auto) |
| frBTC | [32, 0] | Genesis (auto) |
| ftrBTC Master | [31, 0] | Genesis (auto) |

## Example Usage

### After Deployment

1. **Check FROST balance:**
```bash
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes getbalance
```

2. **Inspect a contract:**
```bash
alkanes-cli -p regtest alkanes inspect 4:10
```

3. **Execute a contract call (example: transfer FROST):**
```bash
# Transfer 1000 FROST tokens
# Opcode 1 = transfer, args: amount, recipient_block, recipient_tx
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute '[4:10:1,1000,0,0]' \
  --mine -y
```

4. **Split LBTC into pLBTC + yxLBTC:**
```bash
# First need LBTC tokens (using FROST as mock)
# Opcode 1 = split, args: amount
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute '[4:13:1,10000]' \
  --mine -y
```

5. **Add liquidity to synth pool:**
```bash
# Opcode 2 = add_liquidity, args: token0_amount, token1_amount, min_lp
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute '[4:30:2,100000,100000,0]' \
  --mine -y
```

## Protostone Format

Alkanes transactions use the "protostone" format:

```
[alkane_id:opcode:arg1,arg2,...]
```

Where:
- `alkane_id` = `block:tx` (e.g., `4:10` for FROST at [4, 10])
- `opcode` = operation number (0=init, 1=transfer, etc.)
- `arg1,arg2,...` = comma-separated arguments

### Examples

```bash
# Deploy contract to [3, 50] → becomes [4, 50]
# Then initialize with args
'[3:50:0,1] [4:50:0,arg1,arg2]'

# Call opcode 1 on contract [4, 10]
'[4:10:1,1000,0,0]'

# Multiple calls in one transaction
'[4:10:1,1000,0,0] [4:11:2,500]'
```

## Troubleshooting

### Regtest Node Not Running

**Error:** `Bitcoin regtest node not responding at http://localhost:18888`

**Solution:**
```bash
cd reference/alkanes-rs
docker-compose up -d
```

### alkanes-cli Not Found

**Error:** `alkanes-cli not found at: reference/alkanes-rs/target/release/alkanes-cli`

**Solution:**
```bash
cd reference/alkanes-rs
cargo build --release
```

### WASMs Not Built

**Error:** `WASM directory not found` or `Missing WASM: xxx.wasm`

**Solution:**
```bash
cargo build --release --target wasm32-unknown-unknown
```

### Insufficient Funds

**Error:** `Insufficient funds` during deployment

**Solution:**
```bash
# Get wallet address
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  wallet addresses

# Generate blocks to that address
bitcoin-cli -regtest generatetoaddress 101 <ADDRESS>
```

### Contract Already Deployed

**Warning:** If you run the script multiple times, some contracts may already exist.

**Solution:** 
- The script will show errors for already-deployed contracts
- You can either:
  1. Continue (already deployed contracts will work)
  2. Reset the regtest environment:
     ```bash
     cd reference/alkanes-rs
     docker-compose down -v
     docker-compose up -d
     ```

## Advanced Usage

### Deploy Individual Contracts

You can manually deploy contracts using `alkanes-cli`:

```bash
# Deploy WASM to [3, 50], which creates contract at [4, 50]
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute \
  --envelope target/wasm32-unknown-unknown/release/vx_frost_gauge.wasm \
  --fee-rate 1 \
  --mine \
  -y \
  '[3:50:0,1]'

# Initialize the deployed contract
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute \
  --fee-rate 1 \
  --mine \
  -y \
  '[4:50:0,4,10,4,30]'
```

### Trace Transactions

Enable tracing to see detailed execution:

```bash
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute '[4:10:1,1000,0,0]' \
  --trace \
  --mine -y
```

### Simulate Before Execution

Test a transaction without broadcasting:

```bash
alkanes-cli -p regtest \
  alkanes simulate '[4:10:1,1000,0,0]'
```

## Network Configuration

### Regtest (Default)

- RPC URL: `http://localhost:18888`
- Network: Bitcoin regtest
- Genesis contracts automatically deployed

### Testnet

To use testnet instead of regtest:

```bash
# Set provider to testnet
alkanes-cli -p testnet \
  --wallet-file ~/.alkanes/testnet-wallet.json \
  wallet create
  
# Deploy contracts (same commands, different provider)
```

### Mainnet

⚠️ **WARNING:** Only deploy to mainnet when thoroughly tested!

```bash
alkanes-cli -p mainnet \
  --wallet-file ~/.alkanes/mainnet-wallet.json \
  # ... rest of commands
```

## Development Workflow

### 1. Start Fresh Environment

```bash
cd reference/alkanes-rs
docker-compose down -v
docker-compose up -d
```

### 2. Rebuild Contracts (if changed)

```bash
cargo build --release --target wasm32-unknown-unknown
```

### 3. Deploy

```bash
./reference/subfrost-app/scripts/deploy-regtest-environment.sh
```

### 4. Test Interactions

Use `alkanes-cli` to interact with deployed contracts.

### 5. Iterate

Make changes, rebuild, redeploy.

## Additional Resources

- **alkanes-cli Documentation:** `alkanes-cli --help`
- **Alkanes Protocol:** [reference/alkanes-rs/README.md](../../alkanes-rs/README.md)
- **Test Examples:** [src/tests/](../../../src/tests/)
- **Contract Source:** [alkanes/](../../../alkanes/)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review test files in `src/tests/` for working examples
3. Check alkanes-cli help: `alkanes-cli <command> --help`
