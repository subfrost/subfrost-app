import { useQuery } from '@tanstack/react-query';
import { Buffer } from 'buffer';
import type { AlkaneId, Provider } from '@oyl/sdk';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';
import { useSandshrewProvider } from '@/hooks/useSandshrewProvider';

export const queryPoolFee = async (provider: Provider, alkaneId?: AlkaneId) => {
  if (!provider || !alkaneId) return TOTAL_PROTOCOL_FEE;
  try {
    const result = await provider.sandshrew._call('alkanes_getstorageatstring', [
      { id: { block: Number(alkaneId.block), tx: Number(alkaneId.tx) }, path: '/totalfeeper1000' },
    ]);
    if (result && result.length > 0 && result !== '0x') {
      const buf = Buffer.from(result.slice(2), 'hex');
      const fee = buf.readUInt32LE(0) / Number(1000);
      return fee;
    }
  } catch (error) {
    console.error('Error fetching pool fee:', error);
  }
  return TOTAL_PROTOCOL_FEE;
};

export const usePoolFee = (alkaneId?: AlkaneId) => {
  const provider = useSandshrewProvider();
  return useQuery({
    queryKey: ['poolFee', alkaneId],
    queryFn: async () => queryPoolFee(provider, alkaneId),
    enabled: !!provider && !!alkaneId,
  });
};


