# Core Principles

## 1. One source, one query

If data exists in a response you already have — use it. Never fetch the same data through a different endpoint. Before adding a query, check what's already in React Query cache.

## 2. Events, not timers

Data changes when something happens (new block, user action), not when a clock ticks. Use `staleTime: Infinity` + event-driven invalidation. Timers are a workaround for missing events.

## 3. Finish what you disable

Disabling a feature means removing its entire call chain. If the result is unused, the fetch must be removed too. Dead code that makes network calls is worse than dead code that doesn't.

## 4. Show what you have, fetch what you don't

Never block the UI waiting for all data. Show cached/fast data immediately, let slow data arrive in the background. Independent data = independent loading states.

## 5. The proxy is not free

Every call through Next.js proxy → RPC backend → indexer is 100-500ms minimum. Batch where possible. Cache aggressively. Skip entirely if the data doesn't change between blocks.

## 6. Prove it works end-to-end

A fix is not complete until the console shows the correct call, the UI shows the correct data, and the old call is confirmed absent. Assumptions about what "should" work have cost more time than any bug.
