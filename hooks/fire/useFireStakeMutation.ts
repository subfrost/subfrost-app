/**
 * FIRE Protocol Staking Mutation Hook
 *
 * Stakes LP tokens into the FIRE staking contract [4:257] with a lock duration.
 * Uses two-protostone pattern: p0 edict transfers LP tokens to p1 cellpack.
 *
 * Browser wallet address rules: NEVER use symbolic addresses (p2tr:0) for browser wallets.
 * See CLAUDE.md "Browser Wallet Output Address Bug" for details.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getConfig, getRpcUrl } from '@/utils/getConfig';
import { FIRE_STAKING_OPCODES } from '@/constants';
import { LOCK_TIERS } from '@/utils/fireCalculations';

interface StakeParams {
  lpAmount: string; // LP token amount in base units
  lockTierIndex: number; // Index into LOCK_TIERS
  feeRate: number;
}

export function useFireStakeMutation() {
  const queryClient = useQueryClient();
  const { network, account } = useWallet();

  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useMutation({
    mutationFn: async ({ lpAmount, lockTierIndex, feeRate }: StakeParams) => {
      if (!stakingId) throw new Error('FIRE staking contract not configured');

      const taprootAddress = account?.taproot?.address;
      const segwitAddress = account?.nativeSegwit?.address;
      if (!taprootAddress) throw new Error('Taproot address required');

      const tier = LOCK_TIERS[lockTierIndex];
      if (!tier) throw new Error('Invalid lock tier');

      const [stakingBlock, stakingTx] = stakingId.split(':').map(Number);
      const protostoneStr = `[${stakingBlock},${stakingTx},${FIRE_STAKING_OPCODES.Stake},${tier.duration}]:v0:v0`;

      const lpTokenId = (config as any).FIRE_LP_TOKEN_ID || '2:3';
      const inputReqStr = `${lpTokenId}:${lpAmount}`;

      // Use alkanesExecuteFull directly (same pattern as FujinDifficultyPanel)
      const wasm = await import('@alkanes/ts-sdk/wasm');
      const LOCAL_NETWORKS = ['regtest-local', 'devnet'];
      const isLocal = LOCAL_NETWORKS.includes(network || '');
      const rpcUrl = isLocal ? 'http://localhost:18888' : getRpcUrl(network);

      const execProvider = new wasm.WebProvider(
        network === 'subfrost-regtest' ? 'subfrost-regtest' : 'regtest',
        { jsonrpc_url: rpcUrl, data_api_url: rpcUrl },
      );

      const sessionMnemonic = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('subfrost_session_mnemonic') : null;
      const mnemonic = sessionMnemonic || 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
      execProvider.walletLoadMnemonic(mnemonic, null);

      const fromAddrs = [segwitAddress, taprootAddress].filter(Boolean);
      const result = await execProvider.alkanesExecuteFull(
        JSON.stringify([taprootAddress]),
        inputReqStr,
        protostoneStr,
        feeRate,
        null,
        JSON.stringify({
          from: fromAddrs,
          change_address: segwitAddress || taprootAddress,
          alkanes_change_address: taprootAddress,
          lock_alkanes: true,
          mine_enabled: isLocal,
          auto_confirm: true,
        }),
      );

      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const txId = parsed?.txid || parsed?.reveal_txid || '';
      if (!txId) throw new Error('No txid in result');
      return { success: true, transactionId: txId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fireStakingStats'] });
      queryClient.invalidateQueries({ queryKey: ['fireUserPositions'] });
      queryClient.invalidateQueries({ queryKey: ['enrichedWallet'] });
    },
  });
}
