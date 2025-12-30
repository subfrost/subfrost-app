/**
 * Extended Alkanes Provider
 *
 * Wraps the WASM WebProvider and adds the `alkanesExecuteTyped` method
 * with sensible defaults for address separation:
 * - fromAddresses: ['p2wpkh:0', 'p2tr:0'] (sources from both SegWit and Taproot)
 * - changeAddress: 'p2wpkh:0' (BTC change -> SegWit)
 * - alkanesChangeAddress: 'p2tr:0' (alkane change -> Taproot)
 */

type WebProvider = import('@alkanes/ts-sdk/wasm').WebProvider;

export interface AlkanesExecuteTypedParams {
  toAddresses?: string[];
  inputRequirements: string;
  protostones: string;
  feeRate?: number;
  envelopeHex?: string;
  fromAddresses?: string[];
  changeAddress?: string;
  alkanesChangeAddress?: string;
  traceEnabled?: boolean;
  mineEnabled?: boolean;
  autoConfirm?: boolean;
  rawOutput?: boolean;
}

/**
 * Parse protostones string to find the maximum vN output index referenced
 * This is used to auto-generate the correct number of to_addresses
 *
 * @param protostones - Protostone specification string
 * @returns Maximum vout index found (e.g., "v2" returns 2)
 */
function parseMaxVoutFromProtostones(protostones: string): number {
  let maxVout = 0;

  // Match all vN patterns in the protostones string
  const voutMatches = protostones.matchAll(/v(\d+)/g);

  for (const match of voutMatches) {
    const voutIndex = parseInt(match[1], 10);
    if (voutIndex > maxVout) {
      maxVout = voutIndex;
    }
  }

  return maxVout;
}

/**
 * Execute an alkanes contract with typed parameters and sensible defaults.
 *
 * This provides automatic address separation:
 * - Sources UTXOs from both SegWit (p2wpkh:0) and Taproot (p2tr:0)
 * - Sends BTC change to SegWit (p2wpkh:0)
 * - Sends alkane token change to Taproot (p2tr:0)
 * - Auto-generates toAddresses from protostone vN references
 *
 * @param provider - The WASM WebProvider instance
 * @param params - Typed execution parameters
 * @returns Execution result
 */
export async function alkanesExecuteTyped(
  provider: WebProvider,
  params: AlkanesExecuteTypedParams
): Promise<any> {
  // Parse protostones to determine how many vN outputs are referenced
  const maxVout = parseMaxVoutFromProtostones(params.protostones);

  // Auto-generate toAddresses if not provided
  // Creates one p2tr:0 output for each vN reference (v0, v1, v2, etc.)
  const toAddresses = params.toAddresses ?? Array(maxVout + 1).fill('p2tr:0');

  const options: Record<string, any> = {};

  // Apply automatic defaults for address separation
  options.from_addresses = params.fromAddresses ?? ['p2wpkh:0', 'p2tr:0'];
  options.change_address = params.changeAddress ?? 'p2wpkh:0';
  options.alkanes_change_address = params.alkanesChangeAddress ?? 'p2tr:0';

  if (params.traceEnabled !== undefined) options.trace_enabled = params.traceEnabled;
  if (params.mineEnabled !== undefined) options.mine_enabled = params.mineEnabled;
  if (params.autoConfirm !== undefined) options.auto_confirm = params.autoConfirm;
  if (params.rawOutput !== undefined) options.raw_output = params.rawOutput;

  const optionsJson = Object.keys(options).length > 0 ? JSON.stringify(options) : null;

  // Use alkanesExecuteFull which handles the complete flow internally
  // This avoids serialization issues when passing state between JS and Rust
  const result = await (provider as any).alkanesExecuteFull(
    JSON.stringify(toAddresses),
    params.inputRequirements,
    params.protostones,
    params.feeRate ?? null,
    params.envelopeHex ?? null,
    optionsJson
  );

  return typeof result === 'string' ? JSON.parse(result) : result;
}

/**
 * Extended provider type that includes alkanesExecuteTyped
 */
export interface ExtendedWebProvider extends WebProvider {
  alkanesExecuteTyped: (params: AlkanesExecuteTypedParams) => Promise<any>;
}

/**
 * Extend a WebProvider with the alkanesExecuteTyped method
 *
 * @param provider - The WASM WebProvider instance
 * @returns Extended provider with alkanesExecuteTyped method
 */
export function extendProvider(provider: WebProvider): ExtendedWebProvider {
  const extended = provider as ExtendedWebProvider;
  extended.alkanesExecuteTyped = (params: AlkanesExecuteTypedParams) =>
    alkanesExecuteTyped(provider, params);
  return extended;
}
