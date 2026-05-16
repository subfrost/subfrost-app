#!/usr/bin/env bash
#
# espo-healthcheck.sh — Cross-checks every espo REST/JSON-RPC route the
# subfrost-app depends on against the equivalent metashrew JSON-RPC call.
# Prints per-route PASS / WARN / FAIL with a one-line reason.
#
# Why this exists: swaps fail when espo and metashrew disagree about
# (a) pool reserves, (b) wallet balances, or (c) indexer tip. This script
# is the diagnostic the user runs to localize the divergence before opening
# the WASM SDK and walking the build path with a debugger.
#
# Usage:
#   scripts/espo-healthcheck.sh                 # default: mainnet
#   ESPO=https://oyl.alkanode.com \
#     METASHREW=https://mainnet.subfrost.io/v4/subfrost \
#     WALLET_ADDR=bc1p...sjfs7xwmj4 \
#     POOL=2:77087 \
#     FACTORY=4:65522 \
#     scripts/espo-healthcheck.sh
#
# Exit code: 0 if all PASS, 1 if any FAIL (WARN does not fail the script).

set -uo pipefail

ESPO="${ESPO:-https://oyl.alkanode.com}"
METASHREW="${METASHREW:-https://mainnet.subfrost.io/v4/subfrost}"
WALLET_ADDR="${WALLET_ADDR:-bc1psn0925c2p5mjnvkg0xkntpd26wtcyktmwt3shuw7ue04yed5sjfs7xwmj4}"
POOL="${POOL:-2:77087}"            # DIESEL / frBTC LP pool (mainnet)
FACTORY="${FACTORY:-4:65522}"      # AMM factory (mainnet)
TIMEOUT="${TIMEOUT:-20}"

POOL_BLOCK="${POOL%%:*}"
POOL_TX="${POOL##*:}"
FAC_BLOCK="${FACTORY%%:*}"
FAC_TX="${FACTORY##*:}"

# Colors only when stdout is a tty.
if [[ -t 1 ]]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_YELLOW=$'\033[33m'
  C_DIM=$'\033[2m';   C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_GREEN=''; C_RED=''; C_YELLOW=''; C_DIM=''; C_BOLD=''; C_RESET=''
fi

fail_count=0
warn_count=0
pass_count=0

row() {
  local status="$1" name="$2" detail="$3"
  case "$status" in
    PASS)  printf "  ${C_GREEN}PASS${C_RESET}  %-38s ${C_DIM}%s${C_RESET}\n" "$name" "$detail"; ((pass_count++)) ;;
    WARN)  printf "  ${C_YELLOW}WARN${C_RESET}  %-38s %s\n"                     "$name" "$detail"; ((warn_count++)) ;;
    FAIL)  printf "  ${C_RED}FAIL${C_RESET}  %-38s %s\n"                        "$name" "$detail"; ((fail_count++)) ;;
  esac
}

section() { printf "\n${C_BOLD}== %s ==${C_RESET}\n" "$1"; }

# --------------------------------------------------------------------- helpers

# Strip JSON-RPC envelope and unquote a string result.
metashrew_call() {
  local method="$1"; shift
  local params="${1:-[]}"
  curl -sS --max-time "$TIMEOUT" -X POST "$METASHREW" \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":$params}"
}

# Espo POST with JSON body.
espo_post() {
  local path="$1" body="$2"
  curl -sS --max-time "$TIMEOUT" -X POST "$ESPO$path" \
    -H 'Content-Type: application/json' \
    -d "$body"
}

# Reads a JSON path with jq; falls back to empty on parse error.
jqq() {
  local input="$1" expr="$2"
  printf '%s' "$input" | jq -r "$expr" 2>/dev/null
}

# --------------------------------------------------------------------- header

printf "${C_BOLD}espo healthcheck${C_RESET}  ${C_DIM}%s${C_RESET}\n" "$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "  espo       : $ESPO"
echo "  metashrew  : $METASHREW"
echo "  wallet     : ${WALLET_ADDR:0:14}..."
echo "  pool       : $POOL"
echo "  factory    : $FACTORY"

# --------------------------------------------------------------------- 1. tip

section "Indexer tip"

metashrew_height_raw="$(metashrew_call metashrew_height '[]')"
metashrew_height="$(jqq "$metashrew_height_raw" '.result | tonumber? // (. | tostring | tonumber)')"
if [[ -z "$metashrew_height" || "$metashrew_height" == "null" ]]; then
  row FAIL "metashrew_height" "no response from $METASHREW"
else
  row PASS "metashrew_height" "height=$metashrew_height"
fi

# Bitcoin block height (esplora-style)
bitcoind_height_raw="$(metashrew_call esplora_blocks::tip:height '[]')"
bitcoind_height="$(jqq "$bitcoind_height_raw" '.result | tonumber? // (. | tostring | tonumber)')"
if [[ -z "$bitcoind_height" || "$bitcoind_height" == "null" ]]; then
  row WARN "esplora_blocks::tip:height" "no response (espo+swap can still work)"
else
  row PASS "esplora_blocks::tip:height" "height=$bitcoind_height"
  if [[ -n "$metashrew_height" && -n "$bitcoind_height" ]]; then
    lag=$(( bitcoind_height - metashrew_height ))
    if   (( lag >= 3 )); then row FAIL "indexer_lag"        "metashrew is ${lag} blocks behind bitcoind"
    elif (( lag >= 1 )); then row WARN "indexer_lag"        "metashrew is ${lag} blocks behind bitcoind"
    else                      row PASS "indexer_lag"        "in sync (lag=${lag})"
    fi
  fi
fi

# --------------------------------------------------------------------- 2. pools

section "Pool data (espo REST vs metashrew simulate)"

pools_resp="$(espo_post /get-all-pools-details "{\"factoryId\":{\"block\":\"$FAC_BLOCK\",\"tx\":\"$FAC_TX\"}}")"
pools_count="$(jqq "$pools_resp" '.data.count // .count // (.data.pools // .pools | length)')"
if [[ -z "$pools_count" || "$pools_count" == "null" ]]; then
  row FAIL "espo /get-all-pools-details" "empty/invalid response — broken pool list (most likely swap-breaking)"
  row FAIL "espo /get-all-pools-details" "body head: $(printf '%s' "$pools_resp" | head -c 160)"
elif (( pools_count == 0 )); then
  row FAIL "espo /get-all-pools-details" "count=0 — espo reports no pools at all"
else
  row PASS "espo /get-all-pools-details" "count=$pools_count"
fi

# Per-pool detail (reserves)
pool_resp="$(espo_post /get-pool-details "{\"factoryId\":{\"block\":\"$FAC_BLOCK\",\"tx\":\"$FAC_TX\"},\"poolId\":{\"block\":\"$POOL_BLOCK\",\"tx\":\"$POOL_TX\"}}")"
espo_t0="$(jqq "$pool_resp" '.data.token0Amount // .data.reserve0 // .token0Amount // empty')"
espo_t1="$(jqq "$pool_resp" '.data.token1Amount // .data.reserve1 // .token1Amount // empty')"
if [[ -z "$espo_t0" || -z "$espo_t1" ]]; then
  row FAIL "espo /get-pool-details ($POOL)" "missing reserves; body head: $(printf '%s' "$pool_resp" | head -c 160)"
else
  row PASS "espo /get-pool-details ($POOL)" "t0=$espo_t0 t1=$espo_t1"
fi

# Metashrew simulate opcode 97 (GetReserves) for cross-check.
# Inputs are [opcode]; the WASM returns (u128, u128) packed LE.
simul_body=$(cat <<JSON
{"jsonrpc":"2.0","id":1,"method":"alkanes_simulate","params":[{
  "target":"$POOL_BLOCK:$POOL_TX","inputs":["97"],
  "alkanes":[],"transaction":"0x","block":"0x",
  "height":"$metashrew_height","txindex":0,"vout":0
}]}
JSON
)
simul_resp="$(curl -sS --max-time "$TIMEOUT" -X POST "$METASHREW" -H 'Content-Type: application/json' -d "$simul_body")"
simul_hex="$(jqq "$simul_resp" '.result.execution.data // .result.data // empty')"
if [[ -z "$simul_hex" || "$simul_hex" == "null" ]]; then
  row WARN "metashrew alkanes_simulate (opcode 97)" "no .execution.data; body head: $(printf '%s' "$simul_resp" | head -c 160)"
else
  # Two u128s little-endian = 32 bytes = 64 hex chars + 0x.
  hex="${simul_hex#0x}"
  if (( ${#hex} >= 64 )); then
    r0_hex_le="${hex:0:32}"; r1_hex_le="${hex:32:32}"
    # u128 LE -> decimal (use python — bash can't handle u128).
    metashrew_t0="$(python3 -c "print(int.from_bytes(bytes.fromhex('$r0_hex_le'), 'little'))" 2>/dev/null || echo "")"
    metashrew_t1="$(python3 -c "print(int.from_bytes(bytes.fromhex('$r1_hex_le'), 'little'))" 2>/dev/null || echo "")"
    if [[ -n "$metashrew_t0" && -n "$metashrew_t1" ]]; then
      row PASS "metashrew GetReserves (opcode 97)" "t0=$metashrew_t0 t1=$metashrew_t1"
      if [[ -n "$espo_t0" && -n "$espo_t1" ]]; then
        if [[ "$espo_t0" == "$metashrew_t0" && "$espo_t1" == "$metashrew_t1" ]]; then
          row PASS "RESERVE SYNC ($POOL)" "espo == metashrew"
        else
          row FAIL "RESERVE SYNC ($POOL)" "espo($espo_t0, $espo_t1) != metashrew($metashrew_t0, $metashrew_t1)"
        fi
      fi
    else
      row WARN "metashrew GetReserves decode" "could not parse u128 LE pair from $simul_hex"
    fi
  else
    row WARN "metashrew GetReserves decode" "hex too short ($((${#hex}/2)) bytes); body head: $(printf '%s' "$simul_hex" | head -c 80)"
  fi
fi

# --------------------------------------------------------------------- 3. wallet

section "Wallet balance (espo REST vs metashrew per-outpoint)"

espo_wallet="$(espo_post /get-alkanes-by-address "{\"address\":\"$WALLET_ADDR\"}")"
espo_wallet_count="$(jqq "$espo_wallet" '.data | length // 0')"
if [[ -z "$espo_wallet_count" || "$espo_wallet_count" == "null" ]]; then
  row FAIL "espo /get-alkanes-by-address" "invalid response; body head: $(printf '%s' "$espo_wallet" | head -c 160)"
else
  row PASS "espo /get-alkanes-by-address" "$espo_wallet_count alkanes at $(echo "$WALLET_ADDR" | head -c 14)..."
fi

# Cross-check: esplora UTXOs at the address via metashrew gateway.
utxo_body=$(cat <<JSON
{"jsonrpc":"2.0","id":1,"method":"esplora_address::utxo","params":["$WALLET_ADDR"]}
JSON
)
utxo_resp="$(curl -sS --max-time "$TIMEOUT" -X POST "$METASHREW" -H 'Content-Type: application/json' -d "$utxo_body")"
utxo_count="$(jqq "$utxo_resp" '(.result // []) | length')"
dust_count="$(jqq "$utxo_resp" '(.result // []) | map(select(.value <= 1000)) | length')"
utxo_count="${utxo_count:-0}"
dust_count="${dust_count:-0}"
if (( utxo_count == 0 )); then
  row WARN "metashrew esplora_address::utxo" "0 UTXOs (wallet may be empty or upstream timed out)"
else
  row PASS "metashrew esplora_address::utxo" "$utxo_count UTXOs ($dust_count dust)"
fi

# --------------------------------------------------------------------- 4. btc price

section "Auxiliary routes"

price_resp="$(espo_post /get-bitcoin-price '{}')"
price_usd="$(jqq "$price_resp" '.data.bitcoin.usd // .data.usd // .usd // empty')"
if [[ -z "$price_usd" || "$price_usd" == "null" ]]; then
  row WARN "/get-bitcoin-price (espo POST)" "no usd; body head: $(printf '%s' "$price_resp" | head -c 120)"
else
  row PASS "/get-bitcoin-price (espo POST)" "\$$price_usd"
fi

# Token-details for the pool's tokens (used by wallet display + swap UI).
for ID in "2:0" "32:0" "$POOL_BLOCK:$POOL_TX"; do
  B="${ID%%:*}"; T="${ID##*:}"
  td_resp="$(espo_post /get-alkane-details "{\"alkaneId\":{\"block\":\"$B\",\"tx\":\"$T\"}}")"
  td_name="$(jqq "$td_resp" '.data.name // .name // empty')"
  if [[ -z "$td_name" ]]; then
    row WARN "/get-alkane-details $ID" "no name (alkane may not exist or upstream changed)"
  else
    row PASS "/get-alkane-details $ID" "name=$td_name"
  fi
done

# --------------------------------------------------------------------- summary

section "Summary"
printf "  ${C_GREEN}%d PASS${C_RESET}    ${C_YELLOW}%d WARN${C_RESET}    ${C_RED}%d FAIL${C_RESET}\n" \
  "$pass_count" "$warn_count" "$fail_count"

if (( fail_count > 0 )); then
  exit 1
fi
exit 0
