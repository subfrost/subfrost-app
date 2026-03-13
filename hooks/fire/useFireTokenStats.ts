import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { getConfig } from '@/utils/getConfig';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';
import {
  FIRE_TOKEN_OPCODES,
} from '@/constants';

export interface FireTokenStats {
  name: string;
  symbol: string;
  totalSupply: string;
  maxSupply: string;
  emissionPoolRemaining: string;
  circulatingSupply: string;
}

function parseU128FromBytes(bytes: number[]): string {
  if (!bytes || bytes.length < 16) return '0';
  let value = BigInt(0);
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value.toString();
}

function parseStringFromBytes(bytes: number[]): string {
  if (!bytes || bytes.length === 0) return '';
  return String.fromCharCode(...bytes.filter(b => b !== 0));
}

async function simulateOpcode(
  provider: any,
  contractId: string,
  opcode: number,
): Promise<number[] | null> {
  try {
    const context = JSON.stringify({
      alkanes: [],
      calldata: encodeSimulateCalldata(contractId, [opcode]),
      height: 1000000,
      txindex: 0,
      pointer: 0,
      refund_pointer: 0,
      vout: 0,
      transaction: [],
      block: [],
    });
    const result = await provider.alkanesSimulate(contractId, context, 'latest');
    if (result?.execution?.data && !result?.execution?.error) {
      return result.execution.data;
    }
    return null;
  } catch {
    return null;
  }
}

export function useFireTokenStats(enabled: boolean = true) {
  const { network } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();

  const config = getConfig(network || 'mainnet');
  const fireTokenId = (config as any).FIRE_TOKEN_ID as string | undefined;

  return useQuery({
    queryKey: ['fireTokenStats', fireTokenId, network],
    enabled: enabled && !!fireTokenId && isInitialized && !!provider,
    queryFn: async (): Promise<FireTokenStats> => {
      if (!provider || !fireTokenId) throw new Error('Provider or config not ready');

      const [nameBytes, symbolBytes, totalSupplyBytes, maxSupplyBytes, emissionBytes] =
        await Promise.all([
          simulateOpcode(provider, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetName)),
          simulateOpcode(provider, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetSymbol)),
          simulateOpcode(provider, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetTotalSupply)),
          simulateOpcode(provider, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetMaxSupply)),
          simulateOpcode(provider, fireTokenId, Number(FIRE_TOKEN_OPCODES.GetEmissionPoolRemaining)),
        ]);

      const totalSupply = totalSupplyBytes ? parseU128FromBytes(totalSupplyBytes) : '0';
      const maxSupply = maxSupplyBytes ? parseU128FromBytes(maxSupplyBytes) : '0';
      const emissionPoolRemaining = emissionBytes ? parseU128FromBytes(emissionBytes) : '0';
      const circulatingSupply = (BigInt(totalSupply) - BigInt(emissionPoolRemaining)).toString();

      return {
        name: nameBytes ? parseStringFromBytes(nameBytes) : 'FIRE',
        symbol: symbolBytes ? parseStringFromBytes(symbolBytes) : 'FIRE',
        totalSupply,
        maxSupply,
        emissionPoolRemaining,
        circulatingSupply,
      };
    },
    retry: 2,
    staleTime: 30_000,
  });
}
