/**
 * Position metadata query options.
 *
 * Fetches deposit token info for staked positions via essentials.get_keys RPC.
 * The heavy logic (hex parsing, batch token info) stays in usePositionMetadata.ts.
 */

// Position metadata query logic is tightly coupled with its parsing helpers.
// The hook is refactored in-place to use queryKeys and remove staleTime overrides.
export {};
