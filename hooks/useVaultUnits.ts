import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { parseAlkaneId } from '@/lib/oyl/alkanes/transform';
import type { AlkaneId, UTXO } from '@alkanes/ts-sdk/types';

export interface VaultUnit {
  alkaneId: string; // Full alkane ID like "2:124"
  amount: string; // Usually 1 for vault units
  utxoCount: number; // How many UTXOs contain this unit
}

/**
 * Hook to fetch user's vault unit tokens
 * Vault units are created when depositing to a vault (opcode 1: Purchase)
 * Each unit has a unique alkane ID in the same block as the vault template
 * 
 * @param vaultTemplateId - The vault's unit template ID (e.g., "2:0" for block 2)
 */
export function useVaultUnits(vaultTemplateId: string) {
  const { getUtxos, isConnected } = useWallet();

  return useQuery({
    queryKey: ['vaultUnits', vaultTemplateId],
    queryFn: async (): Promise<VaultUnit[]> => {
      if (!isConnected) {
        return [];
      }

      try {
        const utxos = await getUtxos();
        const templateId = parseAlkaneId(vaultTemplateId);
        
        // Group vault units by alkane ID
        const unitMap = new Map<string, { amount: bigint; count: number }>();

        // Iterate through all UTXOs and find alkanes from the vault's block
        // TODO: Re-integrate alkane parsing logic after ts-sdk rebuild.
        // The structure of alkanes within UTXO might have changed.
        // for (const utxo of utxos) {
        //   if (utxo.alkanes && typeof utxos.alkanes === 'object') {
        //     // alkanes is a Record<AlkaneReadableId, AlkanesUtxoEntry>
        //     for (const [alkaneId, alkaneEntry] of Object.entries(utxo.alkanes)) {
        //       // Parse the alkane ID
        //       const alkaneIdParts = alkaneId.split(':');
        //       if (alkaneIdParts.length !== 2) continue;
              
        //       const [blockStr, txStr] = alkaneIdParts;
        //       const block = blockStr;
              
        //       // Check if this alkane is from the same block as the vault template
        //       // Vault units are created in the same block as the template
        //       if (block === templateId.block) {
        //         const existing = unitMap.get(alkaneId);
                
        //         if (existing) {
        //           existing.amount += BigInt(alkaneEntry.value);
        //           existing.count += 1;
        //         } else {
        //           unitMap.set(alkaneId, {
        //             amount: BigInt(alkaneEntry.value),
        //             count: 1,
        //           });
        //         }
        //       }
        //     }
        //   }
        // }

        // Convert map to array
        const vaultUnits: VaultUnit[] = [];
        for (const [alkaneId, data] of unitMap.entries()) {
          vaultUnits.push({
            alkaneId,
            amount: data.amount.toString(),
            utxoCount: data.count,
          });
        }

        // Sort by alkane ID (most recent first, since tx index increases)
        vaultUnits.sort((a, b) => {
          const aTx = parseInt(a.alkaneId.split(':')[1]);
          const bTx = parseInt(b.alkaneId.split(':')[1]);
          return bTx - aTx; // Descending order
        });

        return vaultUnits;
      } catch (error) {
        console.error('Failed to fetch vault units:', error);
        return [];
      }
    },
    enabled: isConnected && !!vaultTemplateId,
    refetchInterval: 10000, // Refetch every 10 seconds
    staleTime: 5000,
  });
}
