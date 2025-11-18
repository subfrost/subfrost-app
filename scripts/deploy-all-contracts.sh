#!/bin/bash
################################################################################
# Deploy All Contracts - Standalone Script
################################################################################

set -e

export PATH="/Users/erickdelgado/Documents/github/alkanes-rs/target/release:$PATH"
cd /Users/erickdelgado/Documents/github/subfrost-appx

PASSPHRASE="${ALKANES_PASSPHRASE:-deployment123}"

echo "================================================================================"
echo "CONTRACT DEPLOYMENT SCRIPT"
echo "================================================================================"
echo ""

# Check if wallet exists
if ! alkanes-cli -p regtest --passphrase "$PASSPHRASE" wallet addresses >/dev/null 2>&1; then
    echo "❌ Wallet not found. Please create wallet first:"
    echo ""
    echo "   alkanes-cli -p regtest wallet create"
    echo "   # Use passphrase: $PASSPHRASE"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ Wallet found"
echo ""

# Check balance
BALANCE=$(alkanes-cli -p regtest --passphrase "$PASSPHRASE" wallet balance 2>&1 | grep -oE '[0-9]+ sats' | head -1 || echo "0 sats")
echo "Wallet balance: $BALANCE"

if [[ "$BALANCE" == "0 sats" ]]; then
    echo ""
    echo "❌ Wallet has no funds. Please fund it first:"
    echo ""
    echo "   WALLET_ADDRESS=\$(alkanes-cli -p regtest --passphrase \"$PASSPHRASE\" wallet addresses | grep bcrt | head -1 | awk '{print \$NF}')"
    echo "   alkanes-cli -p regtest bitcoind generatetoaddress 101 \"\$WALLET_ADDRESS\""
    echo "   alkanes-cli -p regtest --passphrase \"$PASSPHRASE\" wallet sync"
    echo ""
    exit 1
fi

echo ""
echo "Starting contract deployment..."
echo "================================================================================"
echo ""

DEPLOYED=0
FAILED=0

deploy_contract() {
    local NAME=$1
    local BLOCK=$2
    local TX=$3
    local WASM=$4
    shift 4
    local INIT_ARGS="$@"
    
    echo "[$DEPLOYED/25] Deploying $NAME to [$BLOCK, $TX]..."
    
    # Deploy WASM
    if alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
        alkanes execute "[$BLOCK,$TX]" \
        --envelope "$WASM" \
        --fee-rate 1 --mine -y >/dev/null 2>&1; then
        echo "    ✅ Deployed"
        
        # Initialize if args provided
        if [ -n "$INIT_ARGS" ]; then
            if alkanes-cli -p regtest --passphrase "$PASSPHRASE" \
                alkanes execute "[$BLOCK,$TX,0,$INIT_ARGS]" \
                --fee-rate 1 --mine -y >/dev/null 2>&1; then
                echo "    ✅ Initialized"
            else
                echo "    ⚠️  Init failed (may not be needed)"
            fi
        fi
        
        ((DEPLOYED++))
    else
        echo "    ❌ Failed"
        ((FAILED++))
    fi
    
    sleep 2  # Give indexer time to process
}

# Phase 2: Standard Templates (Block 3)
echo "═══ Phase 2: Standard Templates ═══"
deploy_contract "Auth Token Factory" 3 65517 "prod_wasms/alkanes_std_auth_token.wasm" "100"
deploy_contract "Beacon Proxy" 3 48065 "prod_wasms/alkanes_std_beacon_proxy.wasm" "36863"
deploy_contract "Upgradeable Beacon" 3 48064 "prod_wasms/alkanes_std_upgradeable_beacon.wasm" "32767,4,65519,1"
deploy_contract "Upgradeable Proxy" 3 1 "prod_wasms/alkanes_std_upgradeable.wasm" "32767"
echo ""

# Phase 3: OYL AMM System (Block 4)
echo "═══ Phase 3: OYL AMM System ═══"
deploy_contract "Pool Template" 4 65519 "prod_wasms/pool.wasm" "50"
deploy_contract "Factory Logic" 4 2 "prod_wasms/factory.wasm" "50"
deploy_contract "Factory Proxy" 4 1 "prod_wasms/alkanes_std_upgradeable.wasm" "48065,4,48064"
echo ""

# Phase 4: LBTC Yield System (0x1f00-0x1f17)
echo "═══ Phase 4: LBTC Yield System ═══"
deploy_contract "yv-fr-btc Vault" 4 7937 "prod_wasms/yv_fr_btc_vault.wasm" "32,0"
deploy_contract "dxBTC" 4 7936 "prod_wasms/dx_btc.wasm" "32,0,4,7937"
deploy_contract "LBTC Yield Splitter" 4 7952 "prod_wasms/lbtc_yield_splitter.wasm" ""
deploy_contract "pLBTC" 4 7953 "prod_wasms/p_lbtc.wasm" ""
deploy_contract "yxLBTC" 4 7954 "prod_wasms/yx_lbtc.wasm" ""
deploy_contract "FROST Token" 4 7955 "prod_wasms/frost_token.wasm" ""
deploy_contract "vxFROST Gauge" 4 7956 "prod_wasms/vx_frost_gauge.wasm" ""
deploy_contract "Synth Pool" 4 7957 "prod_wasms/synth_pool.wasm" ""
deploy_contract "LBTC Oracle" 4 7958 "prod_wasms/fr_oracle.wasm" ""
deploy_contract "LBTC Token" 4 7959 "prod_wasms/lbtc.wasm" ""
echo ""

# Phase 5: Futures System (Block 31)
echo "═══ Phase 5: Futures System ═══"
deploy_contract "ftrBTC Master" 31 0 "prod_wasms/ftr_btc.wasm" ""
echo ""

# Phase 6: Gauge System (Block 5)
echo "═══ Phase 6: Gauge System ═══"
deploy_contract "Gauge Contract" 5 1 "prod_wasms/gauge_contract.wasm" ""
echo ""

# Phase 7: Templates (0x1f20-0x1f22)
echo "═══ Phase 7: Templates ═══"
deploy_contract "ve Token Vault Template" 4 7968 "prod_wasms/ve_token_vault_template.wasm" ""
deploy_contract "vx Token Gauge Template" 4 7969 "prod_wasms/vx_token_gauge_template.wasm" ""
deploy_contract "yve Token NFT Template" 4 7970 "prod_wasms/yve_token_nft_template.wasm" ""
echo ""

echo "================================================================================"
echo "DEPLOYMENT COMPLETE"
echo "================================================================================"
echo ""
echo "Successfully deployed: $DEPLOYED contracts"
echo "Failed: $FAILED contracts"
echo ""
echo "Run verification:"
echo "  ./scripts/verify-deployment.sh"
echo ""
