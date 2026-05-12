export type AlkanesDataSource = 'metashrew' | 'espo';

function normalizeDataSource(value: string | undefined): AlkanesDataSource | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'metashrew' || normalized === 'espo') return normalized;
  return null;
}

/**
 * Top-level switch for app blockchain reads that have both Metashrew and Espo
 * implementations. Mainnet defaults to Espo; non-mainnet networks stay on
 * Metashrew unless they grow an Espo deployment.
 */
export function getAlkanesDataSource(network?: string): AlkanesDataSource {
  const configured = normalizeDataSource(
    process.env.NEXT_PUBLIC_ALKANES_DATA_SOURCE ??
      process.env.NEXT_PUBLIC_ALKANES_UTXO_SOURCE ??
      process.env.NEXT_PUBLIC_UTXO_SOURCE,
  ) ?? 'espo';

  if (configured === 'espo' && network && network !== 'mainnet') {
    return 'metashrew';
  }

  return configured;
}
