# Subfrost App — Production Data Flow Architecture

## System Overview

```mermaid
graph TB
    subgraph Browser["Browser (User)"]
        UI[React UI]
        SDK[WASM SDK Provider]
        RQ[TanStack React Query Cache]
        WC[Wallet Context]
    end

    subgraph NextJS["Next.js Server"]
        RPC_PROXY["/api/rpc/{network}"]
        ESP_PROXY["/api/esplora/{path}"]
        BAL_PROXY["/api/alkane-balances"]
    end

    subgraph Infra["Subfrost Infrastructure"]
        SUBFROST_RPC["subfrost RPC\n{network}.subfrost.io/v4/subfrost"]
        ESPO_EXPLORER["Espo Block Explorer\nespo.subfrost.io/{network}"]
        MEMPOOL["mempool.space\n(mainnet fallback)"]
    end

    subgraph Chain["Bitcoin + Alkanes"]
        METASHREW[Metashrew Indexer]
        ESPLORA_IDX[Esplora Indexer]
        ALKANES_IDX[Alkanes Indexer]
    end

    UI --> RQ
    RQ --> SDK
    SDK --> RPC_PROXY
    UI --> ESP_PROXY
    UI --> BAL_PROXY
    RPC_PROXY --> SUBFROST_RPC
    ESP_PROXY --> ESPO_EXPLORER
    ESP_PROXY -.->|mainnet 404 fallback| MEMPOOL
    BAL_PROXY --> SUBFROST_RPC
    SUBFROST_RPC --> METASHREW
    SUBFROST_RPC --> ESPLORA_IDX
    SUBFROST_RPC --> ALKANES_IDX
    ESPO_EXPLORER --> ESPLORA_IDX
```

## Query Invalidation Model

```mermaid
graph LR
    HP["HeightPoller\n(10s interval)"]
    HP -->|height changed| INV["invalidateQueries()"]
    INV --> BTC[BTC Balances]
    INV --> ALK[Alkane Balances]
    INV --> POOLS[Pool Data]
    INV --> PRICE[BTC Price]
    INV --> VAULT[Vault Data]
    INV --> CANDLE[Candle Data]

    OB["Orderbook\n(5s interval)"]

    style HP fill:#2563eb,color:#fff
    style OB fill:#dc2626,color:#fff
    style INV fill:#7c3aed,color:#fff
```

**Only two independent pollers exist on production:**
- **HeightPoller** (10s) — when height changes, invalidates everything else
- **Orderbook** (5s) — must poll independently (CLOB latency requirement)

All other queries use `staleTime: Infinity` and refresh only on height change.

## Read Flows (Queries)

### Wallet Page Load

```mermaid
sequenceDiagram
    participant UI as Wallet UI
    participant RQ as React Query
    participant SDK as WASM SDK
    participant Proxy as /api/rpc
    participant RPC as subfrost RPC

    Note over UI,RPC: Page Mount — 6 upstream calls

    par BTC Balance (per address × 2)
        RQ->>SDK: getEnrichedBalances(segwit)
        SDK->>Proxy: POST lua_evalsaved
        Proxy->>RPC: lua_evalsaved
        RPC-->>Proxy: {spendable[], assets[], pending[]}
        Proxy-->>SDK: response
        SDK-->>RQ: enriched data
    and Mempool Check (per address × 2)
        RQ->>Proxy: POST esplora_address::txs:mempool
        Proxy->>RPC: esplora_address::txs:mempool
        RPC-->>Proxy: mempool txs
        Proxy-->>RQ: pending spend amount
    and Alkane Balances (per address × 2)
        RQ->>SDK: dataApiGetAlkanesByAddress(taproot)
        SDK->>Proxy: POST /get-alkanes-by-address
        Proxy->>RPC: REST → Espo
        RPC-->>Proxy: [{alkaneId, balance, name, symbol}]
        Proxy-->>SDK: token array
        SDK-->>RQ: alkane balances
    end

    RQ->>UI: WalletBalances {bitcoin, alkanes, runes}
```

### Swap Page Load

```mermaid
sequenceDiagram
    participant UI as Swap UI
    participant RQ as React Query
    participant SDK as WASM SDK
    participant Proxy as /api/rpc
    participant RPC as subfrost RPC

    Note over UI,RPC: Pool Discovery

    RQ->>SDK: dataApiGetAllTokenPairs()
    SDK->>Proxy: POST /get-all-token-pairs
    Proxy->>RPC: REST → Espo
    RPC-->>Proxy: pool pairs array
    Proxy-->>SDK: response
    SDK-->>RQ: pools with reserves

    alt Espo fails or returns empty
        RQ->>SDK: alkanesSimulate(factory, opcode 3)
        SDK->>Proxy: POST alkanes_simulate
        Proxy->>RPC: GetAllPools
        RPC-->>SDK: pool IDs
        loop Each Pool
            SDK->>Proxy: POST alkanes_simulate(pool, opcode 999)
            Proxy->>RPC: PoolDetails
            RPC-->>SDK: reserves + metadata
        end
    end

    Note over UI,RPC: Orderbook (5s poll)

    loop Every 5 seconds
        RQ->>Proxy: POST alkanes_simulate
        Note right of Proxy: Carbine controller opcode 24
        Proxy->>RPC: GetOrderbookDepth
        RPC-->>Proxy: bids[] + asks[]
        Proxy-->>RQ: OrderbookData
        RQ-->>UI: render depth chart
    end

    Note over UI,RPC: Chart Candles

    RQ->>SDK: dataApiGetCandles(poolId, timeframe)
    SDK->>Proxy: POST /get-candles
    Proxy->>RPC: REST → Espo
    RPC-->>Proxy: {candles: [{ts, o, h, l, c, v}]}
    Proxy-->>SDK: candle array
    SDK-->>RQ: chart data
```

## Write Flows (Mutations)

### Swap Execution

```mermaid
sequenceDiagram
    participant User
    participant UI as Swap UI
    participant SDK as WASM SDK
    participant Proxy as /api/rpc
    participant RPC as subfrost RPC
    participant BTC as Bitcoin Network

    User->>UI: Click "Swap"

    Note over UI,SDK: Build Transaction

    UI->>SDK: alkanesExecuteTyped({protostones, inputRequirements, ...})

    Note over SDK: SDK internally:<br/>1. Discovers UTXOs via esplora<br/>2. Builds PSBT with auto-edict p0<br/>3. Adds cellpack p1 (factory opcode 13)

    SDK->>Proxy: POST alkanes_simulate (dry run)
    Proxy->>RPC: simulate swap
    RPC-->>SDK: expected output

    SDK-->>UI: unsigned PSBT

    Note over UI,User: Sign Transaction

    alt Browser Wallet (Xverse/UniSat/OKX)
        UI->>UI: patchTapInternalKeys(psbt, userPubKey)
        UI->>User: Wallet popup for signing
        User-->>UI: signed PSBT
    else Keystore Wallet
        UI->>SDK: signSegwitPsbt() + signTaprootPsbt()
        SDK-->>UI: signed PSBT
    end

    Note over UI,BTC: Broadcast

    UI->>SDK: finalize + broadcast
    SDK->>Proxy: POST sendrawtransaction
    Proxy->>RPC: broadcast
    RPC->>BTC: propagate tx
    BTC-->>RPC: txid
    RPC-->>Proxy: txid
    Proxy-->>SDK: txid
    SDK-->>UI: txid

    Note over UI: Invalidate queries → balances refresh
```

### Two-Protostone Pattern (Add Liquidity / Create Pool)

```mermaid
graph LR
    subgraph Transaction
        subgraph p0["p0 — Edict Protostone"]
            E1["Edict: token0 amount → p1"]
            E2["Edict: token1 amount → p1"]
        end
        subgraph p1["p1 — Cellpack Protostone"]
            CC["Cellpack: [pool, 1, ...]<br/>(AddLiquidity opcode)"]
            IA["incomingAlkanes:<br/>token0 + token1<br/>(received from p0)"]
        end
        p0 -->|"tokens flow"| p1
    end

    subgraph Outputs
        V0["v0: BTC change → user segwit"]
        V1["v1: alkane change → user taproot"]
    end

    p1 --> V0
    p1 --> V1
```

### BTC Wrap Flow

```mermaid
sequenceDiagram
    participant User
    participant SDK as WASM SDK
    participant RPC as subfrost RPC
    participant FRBTC as frBTC Contract [32:0]

    User->>SDK: Wrap 0.01 BTC

    Note over SDK: Build PSBT:<br/>Output v0: BTC → signer address<br/>Output v1: protostone → user taproot<br/>Cellpack: [32, 0, 77] (wrap opcode)

    SDK->>RPC: broadcast tx
    RPC->>FRBTC: Contract sees BTC at v0

    Note over FRBTC: Signer address receives BTC<br/>Contract mints frBTC to v1

    FRBTC-->>User: frBTC at user's taproot address
```

## Proxy Routing

```mermaid
graph TD
    subgraph Browser
        SDK_CALL["SDK fetch()"]
        DIRECT["Direct fetch()"]
    end

    subgraph "Next.js API Routes"
        RPC["/api/rpc/{network}<br/>(JSON-RPC + REST)"]
        ESP["/api/esplora/{path}<br/>(Block Explorer)"]
        BAL["/api/alkane-balances<br/>(Balance Aggregation)"]
    end

    subgraph "Upstream Endpoints"
        SF_M["mainnet.subfrost.io/v4/subfrost"]
        SF_S["signet.subfrost.io/v4/subfrost"]
        SF_R["regtest.subfrost.io/v4/subfrost"]
        ESPO_M["espo.subfrost.io/mainnet"]
        ESPO_S["espo.subfrost.io/signet"]
        MP["mempool.space (fallback)"]
    end

    SDK_CALL --> RPC
    DIRECT --> ESP
    DIRECT --> BAL

    RPC -->|"network=mainnet"| SF_M
    RPC -->|"network=signet"| SF_S
    RPC -->|"network=regtest"| SF_R
    BAL --> SF_M

    ESP -->|"network=mainnet"| ESPO_M
    ESP -->|"network=signet"| ESPO_S
    ESP -.->|"mainnet 404"| MP

    style RPC fill:#2563eb,color:#fff
    style ESP fill:#059669,color:#fff
    style BAL fill:#d97706,color:#fff
```

## AMM Contract Call Map

```mermaid
graph TD
    subgraph "Factory Proxy [4:65498]"
        F0["opcode 0: InitFactory"]
        F1["opcode 1: CreateNewPool"]
        F2["opcode 2: FindExistingPoolId"]
        F3["opcode 3: GetAllPools"]
        F11["opcode 11: AddLiquidity (router)"]
        F13["opcode 13: SwapExactTokensForTokens"]
        F14["opcode 14: SwapTokensForExactTokens"]
        F29["opcode 29: SwapImplicit"]
    end

    subgraph "Pool Instance [2:N]"
        P1["opcode 1: AddLiquidity"]
        P2["opcode 2: WithdrawAndBurn"]
        P3["opcode 3: Swap ⚠️ (missing on regtest)"]
        P97["opcode 97: GetReserves"]
        P999["opcode 999: PoolDetails"]
    end

    subgraph "frBTC [32:0]"
        W77["opcode 77: Wrap BTC"]
        W78["opcode 78: Unwrap frBTC"]
        W103["opcode 103: GET_SIGNER"]
        W104["opcode 104: GET_PREMIUM"]
    end

    subgraph "Carbine CLOB [4:70000]"
        C20["opcode 20: PlaceLimitOrder"]
        C24["opcode 24: GetOrderbookDepth"]
        C25["opcode 25: GetUserOrders"]
    end

    F13 -->|"internal delegatecall"| P3
    F1 -->|"deploys via beacon"| P1

    style P3 fill:#dc2626,color:#fff
    style F13 fill:#059669,color:#fff
```

## Request Fan-Out Summary

| Event | Upstream Calls | Via | Trigger |
|-------|---------------|-----|---------|
| Page load (wallet) | 6 | `/api/rpc` | Mount |
| Height poll | 1 | `/api/rpc` | 10s interval |
| Height change | ~8 | `/api/rpc` | Invalidation cascade |
| Orderbook poll | 1 | `/api/rpc` | 5s interval |
| Swap execution | ~4 | `/api/rpc` | User action |
| UTXO fetch (send) | 2-50 | `/api/esplora` | User action |
| Pool discovery | 1-N | `/api/rpc` | Height change |
| Candle fetch | 1 | `/api/rpc` | Height change |
