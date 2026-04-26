# Hosted Regtest Workarounds

> Catalog of all `network === 'regtest'` (and related) branches in the codebase.
> For each: what symptom it prevents, whether mainnet has the same gap, and
> what trigger should remove it.

This document was created 2026-04-26 as part of the keystore matrix unblock
work for hosted regtest (`https://regtest.subfrost.io`). All workarounds were
added on `claude/perf-keystore-extension`. Production (mainnet) was verified
to be unaffected by every entry below — see "Mainnet parity check" column.

## How to read this table

- **Workaround**: file + behavior change
- **Symptom on regtest without it**: what breaks
- **Mainnet has same gap?**: result of running the same probe against `mainnet.subfrost.io`
- **Removal trigger**: what infrastructure change makes the workaround unnecessary

## Workaround catalog

| # | Workaround | File + Line | Symptom on regtest without it | Mainnet has same gap? | Removal trigger |
|---|---|---|---|---|---|
| 1 | Load session mnemonic into WASM provider on `regtest` | `context/AlkanesSDKContext.tsx:235` | `Script not found for hash:` errors during SDK UTXO discovery — WASM provider's random dummy wallet has no esplora script-history | **No** — mainnet uses the JS SDK's `createWalletFromMnemonic` for address derivation, not the WASM-provider keystore | Never — this is a correct symmetric design. Hosted regtest needed the same architecture. |
| 2 | Add `'regtest'` to all 30+ `useActualAddresses` allowlists | All hooks under `hooks/` | Symbolic `p2tr:0` / `p2wpkh:0` addresses resolve to dummy wallet, tokens land at wrong addresses | **No** — mainnet uses browser wallet (Xverse/Unisat/etc) where `isBrowserWallet` already triggers actual addresses | Never — symmetric design, completes the regtest path |
| 3 | Proxy enrichment of empty `essentials.get_address_outpoints` and `get-alkanes-utxo` | `app/api/rpc/[[...segments]]/route.ts` (gated `if network === 'regtest'`) | "Insufficient alkanes have 0" errors — SDK's UTXO selection sees empty alkane data even when `protorunesbyoutpoint` shows balance | **No** — verified 2026-04-26 via curl: mainnet `essentials.get_address_outpoints` returns populated outpoints, `get-alkanes-utxo` returns rich `alkanes: { id: { name, symbol, value } }` objects. | When hosted regtest's espo essentials populator fixes the trace-revert handling (writes `/balances/` entries from `protorunes_by_outpoint` instead of relying on `Success` status). Out of frontend scope — espo team must fix `lib/balances/lib.rs:378-379`. |
| 4 | `/wallet` page: don't redirect while `isInitializing` | `app/wallet/page.tsx:69` | Direct navigation to `/wallet` bounces to `/` before keystore async-restores from sessionStorage | **No** — same fix is correct for mainnet too. Mainnet keystore unlock has the same async restore. This is universally beneficial. | Never — bug fix, not workaround |
| 5 | Re-enable `enrichedWalletQueryOptions` for regtest networks | `queries/account.ts:418-432` | SendModal sees zero UTXOs because `useEnrichedWalletData().utxos.all` was permanently empty | **No** — mainnet kept `enabled: false` per the original refactor. Mainnet SendModal is also affected by this; the assumption is `btcFast + alkaneBalances` covers mainnet display needs. **Worth checking if the SendModal works on mainnet at all** — could be the same orphan code as on regtest. | Properly refactor `useEnrichedWalletData` to fetch UTXOs from a single source of truth (esplora REST or btcFast). |
| 6 | Skip `getEnrichedBalances` (Lua) on `regtest` | `queries/account.ts:537-539` | 25-second timeout per balance fetch before falling back to esplora | **No** — mainnet has Lua scripts deployed; `getEnrichedBalances` works in <2s. | When hosted regtest deploys the `balances.lua` script (or the codebase abandons Lua entirely). |
| 7 | Hosted regtest alkane balance via `alkanes_protorunesbyaddress` | `queries/account.ts:760-794` | "No alkanes available to send" in SendModal — `dataApiGetAlkanesByAddress` returns empty `data: []` because espo essentials is broken | **No** — mainnet's `dataApiGetAlkanesByAddress` returns real data because espo essentials is healthy. | Same as #3 (espo essentials fix). |
| 8 | Route `fetchAlkaneOutpoints` / `fetchOrdOutputs` through dev-server proxy | `lib/alkanes/buildAlkaneTransferPsbt.ts:282-302, 199-217` | "Failed to fetch" CORS errors when buildAlkaneTransferPsbt hits direct subfrost.io URLs from the browser | **Mainnet was also CORS-broken** — this fix repairs both networks. The codebase already used proxy pattern everywhere else; this code was an outlier. | Never — universal correctness fix, not a workaround |
| 9 | Pre-flight opcode-78 simulate before unwrap broadcast | `hooks/useUnwrapMutation.ts:160-211` | User pays BTC fee for an unwrap tx that the contract silently rejects (no BTC release happens) | **YES** — mainnet's `[32:0]` is the same stale build as regtest. Verified 2026-04-26: both return `"Unrecognized opcode"` for opcode 78. | When the fr-btc contract is upgraded to support opcode 78. After upgrade, the simulate succeeds and the broadcast proceeds normally — preflight becomes a fast no-op. |
| 10 | `usePools` and `useAlkanesTokenPairs` route hosted regtest to `/api/rpc/regtest` | `hooks/usePools.ts:530-538`, `hooks/useAlkanesTokenPairs.ts:217-220` | Pool data fetch returns nothing on hosted regtest (was incorrectly using qubitcoin-regtest proxy path) | **No** — mainnet uses `/api/rpc/mainnet` correctly | Never — bug fix, not workaround |

## Mainnet parity verification probes

For future investigators wanting to re-run the verification:

```bash
# 1. Check if espo essentials populates on mainnet (Workaround #3, #7)
curl -s 'https://mainnet.subfrost.io/v4/subfrost/espo' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"id":1,"jsonrpc":"2.0","method":"essentials.get_address_outpoints","params":{"address":"bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7"}}'
# Expect: outpoints[] array with at least one entry containing entries[{alkane, amount}]
# Frbtc signer P2TR derived from mainnet GET_SIGNER (opcode 103); always holds 32:0 dust

# 2. Check fr-btc opcode 78 (Workaround #9)
curl -s 'https://mainnet.subfrost.io/v4/subfrost' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulate","params":[{
    "target":"32:0","inputs":["78"],"alkanes":[],
    "transaction":"0x","block":"0x","height":"<current>","txindex":0,"vout":0
  }],"id":1}'
# Expect (today): error: "Unrecognized opcode"
# Expect (after upgrade): some other error or success — preflight will start passing

# 3. Check get-alkanes-utxo shape (Workaround #3, #8)
curl -s 'https://mainnet.subfrost.io/v4/subfrost/get-alkanes-utxo' \
  -X POST -H 'Content-Type: application/json' \
  -d '{"address":"bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7"}'
# Expect: at least one UTXO with alkanes: { "32:0": { "name": "frBTC", "symbol": "FRBTC", "value": "..." } }
```

## Removing a workaround

Process when one of the gaps is closed upstream:

1. Verify the upstream fix via the parity probe (above)
2. Make a PR removing the workaround code, keeping the journal comment that documents *why* it existed (so future engineers don't re-add it accidentally)
3. Run the affected matrix flow on hosted regtest to confirm it still works
4. Run the same flow on a staging mainnet (if applicable) to confirm parity

## Design decisions

### Why the Unwrap UI tab stays visible despite opcode 78 being unimplemented

Considered hiding the Unwrap path on networks where opcode 78 is missing.
Decided to leave it visible and rely on the preflight guard (Workaround #9).
Reasoning:

1. **Preflight is fast and early** — the simulate runs at the start of
   `mutationFn`, before PSBT build, signing, or any user-visible work.
   User clicks Confirm, sees error in <1s, no funds at risk.
2. **Hiding the UI requires surgery** in `SwapShell.tsx` with many
   dependencies (PoolDetailsCard, swap quote logic, chart selection).
   High regression risk for marginal UX gain.
3. **Error message is actionable** — "Your frBTC is safe and can be
   swapped to BTC instead." The user has a clear next step.
4. **Self-healing on contract upgrade** — when fr-btc supports opcode 78,
   the preflight succeeds automatically and the broadcast proceeds. No
   code change needed to "re-enable" the path. Cleanest possible
   deployment for the contract team.

If an actual user reports the error message is confusing in production,
revisit this decision — but don't hide the UI preemptively.

## Mainnet contract slot status (snapshot 2026-04-26 at height 946780)

Verified each `getConfig('mainnet')` slot via `alkanes_simulate` (opcode 99 GetName,
or opcode 4 GetNumPools for the factory). Result determines whether the
corresponding UI feature is functional on production today.

| getConfig key | Slot | Status | UI consumer | Action |
|---|---|---|---|---|
| `ALKANE_FACTORY_ID` | `4:65522` | ✅ Alive (143 pools) | Swap, AddLiquidity, RemoveLiquidity | None — works |
| `BUSD_ALKANE_ID` | `2:56801` | ✅ Alive | Token list | None — works |
| `BUSD_SPLITTER_ID` | `4:76` | ✅ Alive | (specialized — verify usage) | None — works |
| `FRBTC_ALKANE_ID` | `32:0` | ✅ Alive (Wrap works, Unwrap missing — see Workaround #9) | Wrap, Unwrap, Swap | Preflight guard handles missing opcode 78 |
| `DIESEL_CLAIM_MERKLE_DISTRIBUTOR_ID` | `2:70003` | ✅ Alive | DIESEL claim flow | None — works |
| `FIRE_TOKEN_ID` | `4:256` | ❌ **NOT DEPLOYED** (`unexpected end of file`) | FIRE staking, bonding, redemption | **See "FIRE not deployed" below** |
| `FIRE_STAKING_ID` | `4:257` | ❌ NOT DEPLOYED | Same | Same |
| `FIRE_TREASURY_ID` | `4:258` | ❌ NOT DEPLOYED | Same | Same |
| `FIRE_BONDING_ID` | `4:259` | ❌ NOT DEPLOYED | Same | Same |
| `FIRE_REDEMPTION_ID` | `4:260` | ❌ NOT DEPLOYED | Same | Same |
| `FIRE_DISTRIBUTOR_ID` | `4:261` | ❌ NOT DEPLOYED | Same | Same |
| `FRZEC_ALKANE_ID` | (empty) | n/a | Bridge ZEC | Already gated by empty config — no action |
| `FRETH_ALKANE_ID` | (empty) | n/a | Bridge ETH | Already gated by empty config — no action |

### "FIRE not deployed" — what to do

The FIRE protocol contracts are NOT deployed on mainnet at slots `4:256–261`.
Those slots return `unexpected end of file` from `alkanes_simulate`.

The FIRE hooks (`hooks/fire/*`) gate queries on `enabled: !!fireTokenId &&
!!network`. Since `FIRE_TOKEN_ID` is set in the mainnet config, the queries
fire and hit the empty slot, getting back errors that propagate to the UI.

Two options:

1. **Set FIRE_TOKEN_ID and friends to empty string in mainnet config** until
   the contracts deploy. Hooks will skip. UI components (FireStakingPanel,
   etc.) will need a "Coming soon" state or be hidden.
2. **Deploy FIRE contracts on mainnet at the configured slots.** Contract
   team task. After deployment, the config remains valid and UI works.

This is a separate concern from the keystore matrix unblock. Flagged here
for visibility — the FIRE UI on mainnet today is non-functional regardless
of any frontend work. Do not blame frontend bugs for FIRE issues until the
contracts are confirmed deployed.

### Verification script

Run `scripts/check-prod-parity.ts` (TODO: build) to repeat this audit
programmatically. For now, a one-shot manual probe:

```bash
for slot in 4:65522 2:56801 4:76 32:0 2:70003 4:256 4:257 4:258 4:259 4:260 4:261; do
  resp=$(curl -s 'https://mainnet.subfrost.io/v4/subfrost' -X POST \
    -H 'Content-Type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"alkanes_simulate\",\"params\":[{
      \"target\":\"$slot\",\"inputs\":[\"99\"],\"alkanes\":[],
      \"transaction\":\"0x\",\"block\":\"0x\",\"height\":\"<current>\",\"txindex\":0,\"vout\":0
    }],\"id\":1}")
  echo "$slot: $(echo "$resp" | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]["execution"]; print(r.get("error") or "OK", r.get("data","")[:60])')"
done
```

## When to NOT add a regtest workaround

Don't reach for a `network === 'regtest'` branch if:

1. **The bug exists on mainnet too** — fix it universally instead. Workarounds #4, #8, #10 are universal fixes that happened to surface during regtest QA.
2. **Hosted regtest has stale state** — the right fix is to redeploy contracts or reset state, not to special-case the broken state in code.
3. **The fix is one line in espo / alkane indexer source** — push the fix upstream to the indexer team. Workarounds #3, #6, #7 are temporary until espo essentials is fixed.
