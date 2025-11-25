import { useQuery } from '@tanstack/react-query';
import { Buffer } from 'buffer';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';

// Define types locally to avoid import issues with ts-sdk
type AlkaneId = { block: number | string; tx: number | string };
type Provider = any;

export const queryPoolFee = async (provider: Provider, alkaneId?: AlkaneId) => {
  if (!provider || !alkaneId) return TOTAL_PROTOCOL_FEE;
  try {
    console.log('[usePoolFee] Fetching pool fee with:', {
      url: provider.alkanes?.alkanesUrl,
      alkaneId,
      method: 'alkanes_getstorageatstring',
    });

    const result = await provider.alkanes._call('alkanes_getstorageatstring', [
      { id: { block: Number(alkaneId.block), tx: Number(alkaneId.tx) }, path: '/totalfeeper1000' },
    ]);

    console.log('[usePoolFee] Received result:', result);

    if (result && result.length > 0 && result !== '0x') {
      const buf = Buffer.from(result.slice(2), 'hex');
      const fee = buf.readUInt32LE(0) / Number(1000);
      console.log('[usePoolFee] Parsed fee:', fee);
      return fee;
    }
  } catch (error) {
    console.error('[usePoolFee] Error fetching pool fee:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      providerUrl: provider.alkanes?.alkanesUrl,
      alkaneId,
    });
  }
  console.log('[usePoolFee] Returning default fee:', TOTAL_PROTOCOL_FEE);
  return TOTAL_PROTOCOL_FEE;
};

export const usePoolFee = (alkaneId?: AlkaneId) => {
  const provider = useSandshrewProvider();
  return useQuery({
    queryKey: ['poolFee', alkaneId],
    queryFn: async () => {
      if (!provider) {
        throw new Error('Provider not available');
      }
      return queryPoolFee(provider, alkaneId);
    },
    enabled: !!provider && !!alkaneId,
  });
};
