/**
 * useFireUserPositions — discovers FIRE staking positions via receipt tokens.
 *
 * Architecture: Position tokens (POS-{id}) are alkane NFTs minted to the user's
 * wallet on stake(). Each carries all position data queryable via GetAllDetails
 * (opcode 23). We discover them via alkanes_protorunesbyaddress, then staticcall
 * each to read position details.
 *
 * This replaces the old approach that called simulate with opcode 10 (GetUserPositions)
 * which required context.caller — broken because context.caller = {0,0} for all users.
 */

import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@/context/WalletContext';
import { getRpcUrl, getConfig } from '@/utils/getConfig';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import { encodeSimulateCalldata } from '@/utils/simulateCalldata';

export interface StakingPosition {
  /** The position token's AlkaneId (e.g. "2:5") — used as the unique key */
  tokenId: string;
  positionId: number;
  depositAmount: string;
  weightedAmount: string;
  lockEnd: number;
  lockDuration: number;
  multiplier: number;
  rewardCheckpoint: string;
  depositTokenBlock: number;
  depositTokenTx: number;
}

function parseU128FromHex(hex: string, byteOffset: number): bigint {
  if (!hex || hex.length < (byteOffset + 16) * 2) return 0n;
  const bytes: number[] = [];
  for (let i = 0; i < 16; i++) {
    const pos = (byteOffset + i) * 2;
    bytes.push(parseInt(hex.substring(pos, pos + 2), 16));
  }
  let value = 0n;
  for (let i = 0; i < 16; i++) {
    value |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return value;
}

export function useFireUserPositions(enabled: boolean = true) {
  const { network, isConnected, account } = useWallet();
  const { provider, isInitialized } = useAlkanesSDK();
  const taprootAddress = account?.taproot?.address;
  const config = getConfig(network || 'mainnet');
  const stakingId = (config as any).FIRE_STAKING_ID as string | undefined;

  return useQuery({
    queryKey: ['fireUserPositions', taprootAddress, stakingId, network],
    enabled: enabled && !!taprootAddress && !!stakingId && !!network && isConnected,
    staleTime: 15_000,
    queryFn: async (): Promise<{ positions: StakingPosition[] }> => {
      if (!taprootAddress || !stakingId) return { positions: [] };

      // Step 1: Find all alkane tokens at user's taproot address
      const rpcUrl = getRpcUrl(network);
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'alkanes_protorunesbyaddress',
          params: [{ address: taprootAddress, protocolTag: '1' }],
          id: 1,
        }),
      });
      const json = await resp.json();

      // Step 2: Filter for position token candidates (block=2, amount=1 — NFT receipts)
      const candidates: Array<{ block: number; tx: number }> = [];
      for (const outpoint of json?.result?.outpoints || []) {
        const balances = outpoint.balance_sheet?.cached?.balances || outpoint.runes || [];
        for (const entry of balances) {
          const block = parseInt(entry.block ?? '0', 10);
          const tx = parseInt(entry.tx ?? '0', 10);
          const amount = parseInt(entry.amount || '0', 10);
          // Position tokens are factory-created alkanes at block=2 with amount=1
          if (block === 2 && amount === 1) {
            candidates.push({ block, tx });
          }
        }
      }

      if (candidates.length === 0) return { positions: [] };

      // Step 3: For each candidate, check if it's registered with the staking contract
      // and query its GetAllDetails (opcode 23)
      const [stakingBlock, stakingTx] = stakingId.split(':');
      const positions: StakingPosition[] = [];

      for (const cand of candidates) {
        try {
          // Check IsRegisteredChild (opcode 36) on the staking contract
          const regCheck = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{
                target: { block: stakingBlock, tx: stakingTx },
                inputs: ['36', String(cand.block), String(cand.tx)],
                alkanes: [], transaction: '0x', block: '0x',
                height: '999', txindex: 0, vout: 0,
              }],
              id: 2,
            }),
          });
          const regJson = await regCheck.json();
          const regData = regJson?.result?.execution?.data?.replace('0x', '') || '';
          if (!regData || regData.length < 32) continue;
          const isRegistered = parseU128FromHex(regData, 0);
          if (isRegistered !== 1n) continue;

          // Query GetAllDetails (opcode 23) on the position token itself
          const detailsResp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              method: 'alkanes_simulate',
              params: [{
                target: { block: String(cand.block), tx: String(cand.tx) },
                inputs: ['23'],
                alkanes: [], transaction: '0x', block: '0x',
                height: '999', txindex: 0, vout: 0,
              }],
              id: 3,
            }),
          });
          const detailsJson = await detailsResp.json();
          const data = detailsJson?.result?.execution?.data?.replace('0x', '') || '';
          if (data.length < 288) continue; // 144 bytes = 288 hex chars

          positions.push({
            tokenId: `${cand.block}:${cand.tx}`,
            positionId: Number(parseU128FromHex(data, 0)),
            depositAmount: parseU128FromHex(data, 16).toString(),
            weightedAmount: parseU128FromHex(data, 32).toString(),
            lockEnd: Number(parseU128FromHex(data, 48)),
            lockDuration: Number(parseU128FromHex(data, 64)),
            multiplier: Number(parseU128FromHex(data, 80)),
            rewardCheckpoint: parseU128FromHex(data, 96).toString(),
            depositTokenBlock: Number(parseU128FromHex(data, 112)),
            depositTokenTx: Number(parseU128FromHex(data, 128)),
          });
        } catch {
          // Skip tokens that fail to query
          continue;
        }
      }

      return { positions };
    },
    retry: 2,
  });
}
