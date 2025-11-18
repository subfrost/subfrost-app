#!/bin/bash
################################################################################
# Contract Deployment Verification Script
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
ALKANES_CLI="${ALKANES_CLI:-alkanes-cli}"
INDEXER_URL="${INDEXER_URL:-http://localhost:18888/v2/regtest}"
WASM_DIR="${WASM_DIR:-./prod_wasms}"

# Counters
TOTAL=0
DEPLOYED=0
MISSING=0
ERRORS=0

log_info() { echo -e "${BLUE}ℹ${NC} $*"; }
log_success() { echo -e "${GREEN}✅${NC} $*"; }
log_warning() { echo -e "${YELLOW}⚠${NC}  $*"; }
log_error() { echo -e "${RED}❌${NC} $*"; }

verify_contract() {
  local NAME=$1
  local BLOCK=$2
  local TX=$3
  local EXPECTED_WASM=$4
  
  ((TOTAL++))
  
  printf "%-35s [%3d, 0x%-6x] " "$NAME" "$BLOCK" "$TX"
  
  # Try to get bytecode
  local BYTECODE_HEX=$($ALKANES_CLI -p regtest alkanes getbytecode $BLOCK $TX 2>/dev/null || echo "")
  
  if [ -z "$BYTECODE_HEX" ] || [ "$BYTECODE_HEX" = "null" ]; then
    echo -e "${RED}❌ NOT DEPLOYED${NC}"
    ((MISSING++))
    return 1
  fi
  
  # Get size
  local SIZE=$((${#BYTECODE_HEX} / 2))
  
  # Optionally verify against expected WASM
  if [ -n "$EXPECTED_WASM" ] && [ -f "$EXPECTED_WASM" ]; then
    local EXPECTED_SIZE=$(stat -f%z "$EXPECTED_WASM" 2>/dev/null || stat -c%s "$EXPECTED_WASM" 2>/dev/null)
    if [ "$SIZE" = "$EXPECTED_SIZE" ]; then
      echo -e "${GREEN}✅ ${SIZE} bytes (VERIFIED)${NC}"
      ((DEPLOYED++))
      return 0
    else
      echo -e "${YELLOW}⚠  ${SIZE} bytes (SIZE MISMATCH: expected $EXPECTED_SIZE)${NC}"
      ((DEPLOYED++))
      ((ERRORS++))
      return 0
    fi
  else
    echo -e "${GREEN}✅ ${SIZE} bytes${NC}"
    ((DEPLOYED++))
    return 0
  fi
}

echo "================================================================================"
echo "CONTRACT DEPLOYMENT VERIFICATION"
echo "================================================================================"
echo ""
echo "Indexer: $INDEXER_URL"
echo "CLI:     $ALKANES_CLI"
echo ""

# Check indexer connectivity
BLOCK_COUNT=$(curl -s "$INDEXER_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"btc_getblockcount","params":[]}' | jq -r '.result' 2>/dev/null || echo "0")
echo "Current block height: $BLOCK_COUNT"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 1: FOUNDATION TOKENS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
# Note: DIESEL [2,0] and ftrBTC [32,0] are assumed from infrastructure
log_info "Skipping DIESEL [2,0] and ftrBTC [32,0] (infrastructure-provided)"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 2: STANDARD TEMPLATES (Block 3)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
verify_contract "Auth Token Factory" 3 $((0xffed)) "$WASM_DIR/alkanes_std_auth_token.wasm"
verify_contract "Beacon Proxy" 3 $((0xbeac1)) "$WASM_DIR/alkanes_std_beacon_proxy.wasm"
verify_contract "Upgradeable Beacon" 3 $((0xbeac0)) "$WASM_DIR/alkanes_std_upgradeable_beacon.wasm"
verify_contract "Upgradeable Proxy" 3 1 "$WASM_DIR/alkanes_std_upgradeable.wasm"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 3: OYL AMM SYSTEM (Block 4)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
verify_contract "Pool Template" 4 $((0xffef)) "$WASM_DIR/pool.wasm"
verify_contract "Factory Logic" 4 2 "$WASM_DIR/factory.wasm"
verify_contract "Factory Proxy" 4 1 "$WASM_DIR/alkanes_std_upgradeable.wasm"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 4: LBTC YIELD SYSTEM (0x1f00-0x1f17)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
verify_contract "dxBTC" 4 $((0x1f00)) "$WASM_DIR/dx_btc.wasm"
verify_contract "yv-fr-btc Vault" 4 $((0x1f01)) "$WASM_DIR/yv_fr_btc_vault.wasm"
verify_contract "LBTC Yield Splitter" 4 $((0x1f10)) "$WASM_DIR/lbtc_yield_splitter.wasm"
verify_contract "pLBTC" 4 $((0x1f11)) "$WASM_DIR/p_lbtc.wasm"
verify_contract "yxLBTC" 4 $((0x1f12)) "$WASM_DIR/yx_lbtc.wasm"
verify_contract "FROST Token" 4 $((0x1f13)) "$WASM_DIR/frost_token.wasm"
verify_contract "vxFROST Gauge" 4 $((0x1f14)) "$WASM_DIR/vx_frost_gauge.wasm"
verify_contract "Synth Pool" 4 $((0x1f15)) "$WASM_DIR/synth_pool.wasm"
verify_contract "LBTC Oracle" 4 $((0x1f16)) "$WASM_DIR/fr_oracle.wasm"
verify_contract "LBTC Token" 4 $((0x1f17)) "$WASM_DIR/lbtc.wasm"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 5: FUTURES SYSTEM (Block 31)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
verify_contract "ftrBTC Master" 31 0 "$WASM_DIR/ftr_btc.wasm"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 6: GAUGE SYSTEM (Block 5)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
verify_contract "Gauge Contract" 5 1 "$WASM_DIR/gauge_contract.wasm"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PHASE 7: TEMPLATES (0x1f20-0x1f22)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
verify_contract "ve Token Vault Template" 4 $((0x1f20)) "$WASM_DIR/ve_token_vault_template.wasm"
verify_contract "vx Token Gauge Template" 4 $((0x1f21)) "$WASM_DIR/vx_token_gauge_template.wasm"
verify_contract "yve Token NFT Template" 4 $((0x1f22)) "$WASM_DIR/yve_token_nft_template.wasm"
echo ""

echo "================================================================================"
echo "VERIFICATION SUMMARY"
echo "================================================================================"
echo ""
echo "Total contracts checked: $TOTAL"
echo -e "✅ Deployed:            ${GREEN}$DEPLOYED${NC}"
echo -e "❌ Missing:             ${RED}$MISSING${NC}"
echo -e "⚠️  Errors:              ${YELLOW}$ERRORS${NC}"
echo ""

if [ $MISSING -gt 0 ]; then
  echo -e "${YELLOW}⚠  Some contracts are missing. Run deployment script:${NC}"
  echo "   ./scripts/deploy-regtest.sh --skip-infra"
  exit 1
elif [ $ERRORS -gt 0 ]; then
  echo -e "${YELLOW}⚠  All contracts deployed but some have size mismatches${NC}"
  exit 0
else
  echo -e "${GREEN}✅ All contracts verified successfully!${NC}"
  exit 0
fi
