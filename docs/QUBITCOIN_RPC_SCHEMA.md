# Qubitcoin RPC Schema

> Endpoint: `https://meta.lake.direct` (VPN required)
> Compat layer: `qubitcoin-compat-jsonrpc`
> Verified: 2026-04-08

---

## Method Routing

```
secondaryview   → metashrew (METASHREW_URL)     alkanes indexer views
secondaryheight → metashrew                      alkanes indexer height
tertiaryview    → espo HTTP (ESPO_URL)           espo REST JSON-RPC
tertiaryheight  → espo                           espo height (via qubitcoind internal)
*               → bitcoind (BITCOIND_URL)        all other methods
```

---

## 1. secondaryview ✅

```
method: "secondaryview"
params: ["alkanes", view_fn, input_hex, block_tag]
```

| Param | Type | Example |
|-------|------|---------|
| label | string | `"alkanes"` |
| view_fn | string | `"simulate"`, `"protorunesbyaddress"` |
| input_hex | string | `"0x"` + protobuf hex |
| block_tag | string | `"latest"` |

**Proxied to:** `metashrew_view(view_fn, input_hex, block_tag)`
**Response:** protobuf hex

### simulate — input encoding

```
Field 4 (0x20): height (varint)
Field 5 (0x2A): calldata (length-delimited)
  calldata = LEB128(block) + LEB128(tx) + LEB128(opcode) [+ LEB128(args)...]
Field 6 (0x30): txindex (varint, usually 1)
```

### protorunesbyaddress — input encoding

```
Field 1 (0x0A): address (length-delimited UTF-8)
Field 2 (0x12): protocol_tag = [0x08, 0x01]
```

### Verified calls

| Call | Status | Response |
|------|--------|----------|
| `simulate` DIESEL GetName(99) | ✅ | `"DIESEL"` |
| `simulate` contract opcode | ✅ | protobuf SimulateResponse |
| `protorunesbyaddress` | ✅ | protobuf balance entries |

---

## 2. secondaryheight ✅

```
method: "secondaryheight"
params: ["alkanes"]
```

**Response:** string (block height)
**Verified:** ✅ returns `"766"`

---

## 3. tertiaryview ✅ (partial)

```
method: "tertiaryview"
params: ["espo", method_name, hex_encoded_json]
```

| Param | Type | Example |
|-------|------|---------|
| label | string | `"espo"` |
| method_name | string | `"essentials.get_alkane_info"` |
| hex_encoded_json | string | `hex(JSON.stringify(params))` |

**Proxied to:** espo HTTP JSON-RPC at `ESPO_URL`
**Response:** `"0x"` + hex-encoded JSON

### Encoding

```javascript
// encode
const hex = Buffer.from(JSON.stringify({ alkane: "2:0" })).toString('hex');
// → tertiaryview("espo", "essentials.get_alkane_info", hex)

// decode response
const result = JSON.parse(Buffer.from(response.result.replace('0x',''), 'hex'));
```

### Loaded modules (from espo config)

```
essentials  ✅  always loaded
subfrost    ✅  loaded (config: {})
pizzafun    ✅  loaded
ammdata     ❌  disabled (missing config — needs factory_id, pool_ids)
oylapi      ❌  disabled (missing config)
```

### Verified methods

**essentials:**

| Method | Params | Status | Response |
|--------|--------|--------|----------|
| `essentials.ping` | `{}` | ✅ | `"pong"` |
| `essentials.get_alkane_info` | `{"alkane":"2:0"}` | ✅ | Full metadata (name, symbol, opcodes, holders) |
| `essentials.get_address_outpoints` | `{"address":"bcrt1p..."}` | ✅ | `{outpoints: [{outpoint, entries: [{alkane, amount}]}]}` |
| `essentials.get_address_balances` | `{"address":"bcrt1p..."}` | ✅ | `{balances: {"2:0": "10000000000", "32:0": "9990000"}}` |
| `essentials.get_all_alkanes` | `{}` | ✅ | All deployed alkanes with metadata (29 items) |
| `essentials.get_alkane_balances` | `{"alkane":"2:0"}` | ✅ | Holder balances for a token |
| `essentials.get_holders` | `{"alkane":"2:0"}` | ✅ | Holder list |
| `essentials.get_address_activity` | `{"address":"..."}` | ✅ | Transaction activity |
| `essentials.get_block_traces` | `{"height":N}` | ✅ | Traces for block |
| `essentials.get_block_summary` | `{"height":N}` | ✅ | Block summary |

**subfrost:**

| Method | Params | Status | Response |
|--------|--------|--------|----------|
| `subfrost.get_wrap_events_by_address` | `{"address":"..."}` | ✅ | Wrap events |
| `subfrost.get_unwrap_events_by_address` | `{"address":"..."}` | ✅ | Unwrap events |
| `subfrost.get_wrap_events_all` | `{}` | ✅ | All wrap events |
| `subfrost.get_unwrap_events_all` | `{}` | ✅ | All unwrap events |

**other:**

| Method | Params | Status |
|--------|--------|--------|
| `get_espo_height` | `{}` | ✅ |

**ammdata (disabled — needs config):**

| Method | Status | Notes |
|--------|--------|-------|
| `ammdata.get_pools` | ❌ | Needs factory_id in espo config |
| `ammdata.get_candles` | ❌ | |
| `ammdata.get_activity` | ❌ | |
| `ammdata.get_amm_factories` | ❌ | |
| `ammdata.find_best_swap_path` | ❌ | |
| `ammdata.get_btc_usd_price` | ❌ | |

### NOT available

| Method | Why | Workaround |
|--------|-----|------------|
| `ammdata.*` | Module disabled (missing config) | `secondaryview simulate` on pool contracts |
| quspo WASM views | Loaded in qubitcoind, not in espo | `secondaryview simulate` |

To enable `ammdata`: add factory config to espo config.json:
```json
"modules": {
  "subfrost": {},
  "ammdata": { "factory_id": "4:65522" }
}
```

---

## 4. tertiaryheight ✅

```
method: "tertiaryheight"
params: ["quspo"]
```

**Response:** number (766)
**Verified:** ✅

---

## 5. Bitcoin RPC (passthrough) ✅

```
method: any standard bitcoin RPC
params: standard bitcoin params
```

| Method | Status | Notes |
|--------|--------|-------|
| `getblockcount` | ✅ | |
| `generatetoaddress` | ✅ | regtest only |
| `getrawtransaction` | ✅ | |
| `sendrawtransaction` | ⚠️ | `maxburnamount` default=0, rejects OP_RETURN. Needs param override. |
| `testmempoolaccept` | ✅ | detailed reject-reason |
| `validateaddress` | ✅ | |

---

## Proxy Translation (`/api/rpc/qubitcoin-regtest`)

```
SDK / Frontend               Proxy rewrites to                Target
────────────────────────────────────────────────────────────────────────
metashrew_view(fn,hex,tag) → secondaryview("alkanes",fn,hex,tag)  → meta.lake.direct
metashrew_height()         → secondaryheight("alkanes")            → meta.lake.direct
alkanes_simulate(params)   → secondaryview("alkanes","simulate",...) → meta.lake.direct
esplora_address::utxo      → REST /address/{addr}/utxo            → 192.168.10.140:31050
esplora_address::txs:mem.. → REST /address/{addr}/txs/mempool     → 192.168.10.140:31050
esplora_tx                 → REST /tx/{txid}                       → 192.168.10.140:31050
lua_*                      → direct                                → 192.168.10.140:31080
ord_*                      → stub (empty)                          → N/A
REST sub-paths             → empty (no data API)                   → N/A
bitcoin RPC                → passthrough                           → meta.lake.direct
```

---

## K3s Services (192.168.10.140)

| Service | NodePort | Internal | Contains |
|---------|----------|----------|----------|
| qubitcoin-jsonrpc | 31944 | 19443 | compat-jsonrpc (translates to all below) |
| metashrew | 31080 | 8080 | rockshrew + espo sidecar (5778) |
| esplora | 31050 | 50010 | electrs block explorer |
| bitcoind | 31443 | 18443 | bitcoin regtest node |
| ord | — | 8090 | ordinals indexer |
| espo | 31578 | 5778 | espo REST (inside metashrew pod) |

---

## Environment (qubitcoin-compat-jsonrpc)

```
LISTEN_ADDR    = 0.0.0.0:19443
BITCOIND_URL   = http://bitcoind.regtest-alkanes:18443
METASHREW_URL  = http://metashrew.regtest-alkanes:8080
ESPLORA_URL    = http://esplora.regtest-alkanes:50010  (not used by compat-jsonrpc directly)
ESPO_URL       = http://espo.regtest-alkanes:5778
ORD_URL        = http://ord.regtest-alkanes:8090
```
