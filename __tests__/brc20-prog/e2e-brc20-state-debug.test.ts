/**
 * Debug test: verify brc20shrew processes inscriptions from deploy/transact
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createBrc20DevnetContext, disposeBrc20Harness, mineBlocks } from './brc20-prog-helpers';
import { deployFrBtcContract } from './brc20-prog-deploy';
import { BRC20_PROG, loadFrBtcFoundryJson } from './brc20-prog-constants';

let rpcId = 1;
async function rpcCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(BRC20_PROG.RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id: rpcId++ }),
  });
  return response.json();
}

const hasFoundry = !!loadFrBtcFoundryJson();

describe.runIf(hasFoundry)('Debug: BRC20 State After Deploy', () => {
  let harness: any;
  let provider: any;
  let contractAddress: string | null;

  beforeAll(async () => {
    const ctx = await createBrc20DevnetContext();
    harness = ctx.harness;
    provider = ctx.provider;
    await mineBlocks(harness, 201);

    contractAddress = await deployFrBtcContract(provider, harness);
    console.log('[debug] Contract address:', contractAddress);
  }, 300_000);

  afterAll(() => disposeBrc20Harness());

  it('should have deployed contract', () => {
    expect(contractAddress).toBeDefined();
  });

  it('should query EVM state via metashrew_view call', async () => {
    if (!contractAddress) return;

    // Build a simple eth_call to the contract (call decimals())
    // decimals() selector = 0x313ce567
    const toBytes = Array.from(Buffer.from(contractAddress.replace('0x', ''), 'hex'));
    const dataBytes = Array.from(Buffer.from('313ce567', 'hex'));
    const callRequest = JSON.stringify({ to: toBytes, data: dataBytes });
    const hexInput = '0x' + Buffer.from(callRequest).toString('hex');

    const result = await rpcCall('metashrew_view', ['call', hexInput, 'latest']);
    console.log('[debug] eth_call(decimals) raw result:', JSON.stringify(result).slice(0, 300));

    if (result.result) {
      const hex = result.result.replace('0x', '');
      const jsonBytes = Buffer.from(hex, 'hex');
      console.log('[debug] Decoded CallResponse:', jsonBytes.toString('utf-8'));
    }
  }, 30_000);

  it('should check if inscription was indexed by shrew-ord', async () => {
    // Check the global sequence counter to see if inscriptions were found
    const seqResult = await rpcCall('metashrew_view', ['getblockheight', '0x' + Buffer.from('{}').toString('hex'), 'latest']);
    console.log('[debug] Block height from brc20shrew:', JSON.stringify(seqResult).slice(0, 200));

    if (seqResult.result) {
      const hex = seqResult.result.replace('0x', '');
      const json = Buffer.from(hex, 'hex').toString('utf-8');
      console.log('[debug] Decoded:', json);
    }
  }, 30_000);

  it('should check inscription count via getinscriptions', async () => {
    const req = JSON.stringify({ start: 0, count: 10 });
    const hexInput = '0x' + Buffer.from(req).toString('hex');
    const result = await rpcCall('metashrew_view', ['getinscriptions', hexInput, 'latest']);
    console.log('[debug] getinscriptions result:', JSON.stringify(result).slice(0, 500));

    if (result.result) {
      const hex = result.result.replace('0x', '');
      const json = Buffer.from(hex, 'hex').toString('utf-8');
      console.log('[debug] Decoded inscriptions:', json.slice(0, 500));
    }
  }, 30_000);
});
