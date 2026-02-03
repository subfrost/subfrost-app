/**
 * Charts / candles query options.
 *
 * The actual fetching logic (mock generators, Espo API calls, aggregation)
 * stays in the hook files. This file provides queryOptions wrappers with
 * centralized keys and no polling config.
 */

// This module is intentionally thin — the chart hooks have complex internal
// logic (mock data generation, pagination, 4h aggregation) that doesn't
// benefit from extraction. The hooks themselves are refactored to remove
// refetchInterval / staleTime overrides and use queryKeys from keys.ts.

export {};
