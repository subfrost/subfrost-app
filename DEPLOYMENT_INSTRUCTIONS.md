# Contract Deployment Instructions

## Current Status

Infrastructure is running with 1082+ blocks on regtest. Contracts need to be deployed.

## Problem Identified

The `alkanes-cli` requires a wallet to be set up for contract deployment. The deployment script needs wallet configuration.

## Solution: Run Deployment in Separate Terminal

### Step 1: Setup Wallet (Run in terminal)

```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
export PATH="/Users/erickdelgado/Documents/github/alkanes-rs/target/release:$PATH"

# Create wallet directory
mkdir -p ~/.alkanes

# Create wallet (interactive - will prompt for passphrase)
# Use passphrase: "deployment123"
alkanes-cli -p regtest wallet create

# Save the mnemonic and address that are displayed!
```

### Step 2: Fund Wallet

```bash
# Get your wallet address from Step 1 output
WALLET_ADDRESS="bcrt1q..." # Replace with your address

# Generate blocks to fund wallet
alkanes-cli -p regtest bitcoind generatetoaddress 101 "$WALLET_ADDRESS"

# Sync wallet
alkanes-cli -p regtest --passphrase "deployment123" wallet sync

# Check balance (should show 50 BTC)
alkanes-cli -p regtest --passphrase "deployment123" wallet balance
```

### Step 3: Deploy Contracts Manually

Since the automated script has wallet issues, deploy contracts one by one:

```bash
export PATH="/Users/erickdelgado/Documents/github/alkanes-rs/target/release:$PATH"
cd /Users/erickdelgado/Documents/github/subfrost-appx

PASSPHRASE="deployment123"

# Phase 2: Standard Templates (Block 3)
echo "Deploying Auth Token Factory..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,65517]" \
  --envelope prod_wasms/alkanes_std_auth_token.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,65517,0,100]" \
  --fee-rate 1 --mine -y

echo "Deploying Beacon Proxy..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,48065]" \
  --envelope prod_wasms/alkanes_std_beacon_proxy.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,48065,0,36863]" \
  --fee-rate 1 --mine -y

echo "Deploying Upgradeable Beacon..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,48064]" \
  --envelope prod_wasms/alkanes_std_upgradeable_beacon.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,48064,0,32767,4,65519,1]" \
  --fee-rate 1 --mine -y

echo "Deploying Upgradeable Proxy..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,1]" \
  --envelope prod_wasms/alkanes_std_upgradeable.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[3,1,0,32767]" \
  --fee-rate 1 --mine -y

# Phase 3: OYL AMM System (Block 4)
echo "Deploying Pool Template..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,65519]" \
  --envelope prod_wasms/pool.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,65519,0,50]" \
  --fee-rate 1 --mine -y

echo "Deploying Factory Logic..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,2]" \
  --envelope prod_wasms/factory.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,2,0,50]" \
  --fee-rate 1 --mine -y

echo "Deploying Factory Proxy..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,1]" \
  --envelope prod_wasms/alkanes_std_upgradeable.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,1,0,48065,4,48064]" \
  --fee-rate 1 --mine -y

# Phase 4: LBTC Yield System
echo "Deploying yv-fr-btc Vault..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,7937]" \
  --envelope prod_wasms/yv_fr_btc_vault.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,7937,0,32,0]" \
  --fee-rate 1 --mine -y

echo "Deploying dxBTC..."
alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,7936]" \
  --envelope prod_wasms/dx_btc.wasm \
  --fee-rate 1 --mine -y

alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
  alkanes execute "[4,7936,0,32,0,4,7937]" \
  --fee-rate 1 --mine -y

# Continue with remaining contracts...
# (See full list in CONTRACT_DEPLOYMENT_GUIDE.md)
```

### Step 4: Verify Deployments

```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
export PATH="/Users/erickdelgado/Documents/github/alkanes-rs/target/release:$PATH"

./scripts/verify-deployment.sh
```

## Alternative: Automated Script (if wallet is set up)

If you've completed Steps 1-2 above, you can try the automated script:

```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
export PATH="/Users/erickdelgado/Documents/github/alkanes-rs/target/release:$PATH"

# Set passphrase
export ALKANES_PASSPHRASE="deployment123"

# Run deployment
./scripts/deploy-regtest.sh --skip-infra -y
```

## Deployment Checklist

### Phase 2: Standard Templates (Block 3)
- [ ] Auth Token Factory [3, 0xffed]
- [ ] Beacon Proxy [3, 0xbeac1]
- [ ] Upgradeable Beacon [3, 0xbeac0]
- [ ] Upgradeable Proxy [3, 1]

### Phase 3: OYL AMM System (Block 4)
- [ ] Pool Template [4, 0xffef]
- [ ] Factory Logic [4, 2]
- [ ] Factory Proxy [4, 1]

### Phase 4: LBTC Yield System (0x1f00-0x1f17)
- [ ] yv-fr-btc Vault [4, 0x1f01]
- [ ] dxBTC [4, 0x1f00]
- [ ] LBTC Yield Splitter [4, 0x1f10]
- [ ] pLBTC [4, 0x1f11]
- [ ] yxLBTC [4, 0x1f12]
- [ ] FROST Token [4, 0x1f13]
- [ ] vxFROST Gauge [4, 0x1f14]
- [ ] Synth Pool [4, 0x1f15]
- [ ] LBTC Oracle [4, 0x1f16]
- [ ] LBTC Token [4, 0x1f17]

### Phase 5: Futures System (Block 31)
- [ ] ftrBTC Master [31, 0]

### Phase 6: Gauge System (Block 5)
- [ ] Gauge Contract [5, 1]

### Phase 7: Templates (0x1f20-0x1f22)
- [ ] ve Token Vault Template [4, 0x1f20]
- [ ] vx Token Gauge Template [4, 0x1f21]
- [ ] yve Token NFT Template [4, 0x1f22]

## Troubleshooting

### Wallet Issues
- Error: "Wallet must be unlocked" → Run wallet create first
- Error: "Insufficient funds" → Generate more blocks to wallet address

### Deployment Issues
- Error: "Contract already exists" → Skip that contract, it's already deployed
- Error: "RPC error" → Check infrastructure is running

### Verification
Check any contract:
```bash
alkanes-cli -p regtest alkanes getbytecode <block> <tx>
```

Example:
```bash
alkanes-cli -p regtest alkanes getbytecode 3 65517
# Should return hex bytecode if deployed
```
