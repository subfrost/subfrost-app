import { describe, it, expect } from 'vitest';
import { getConfig, SUBFROST_API_URLS, BLOCK_EXPLORER_URLS, getTxExplorerUrl } from '../getConfig';

describe('getConfig', () => {
  // --- Factory IDs ---

  it('regtest returns factory ID 4:65498', () => {
    const config = getConfig('regtest');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65498');
  });

  it('subfrost-regtest returns same factory ID as regtest', () => {
    const config = getConfig('subfrost-regtest');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65498');
  });

  it('mainnet returns factory ID 4:65522', () => {
    const config = getConfig('mainnet');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65522');
  });

  it('devnet returns factory ID 4:65498', () => {
    const config = getConfig('devnet');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65498');
  });

  it('signet returns factory ID 4:65522', () => {
    const config = getConfig('signet');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65522');
  });

  // --- RPC / API URLs ---

  it('returns correct API URL for regtest', () => {
    const config = getConfig('regtest');
    expect(config.API_URL).toBe('https://regtest.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75');
  });

  it('returns correct API URL for mainnet', () => {
    const config = getConfig('mainnet');
    expect(config.API_URL).toBe('https://mainnet.subfrost.io/v4/5d37098b75581792a44b9d230d48aa75');
  });

  it('returns correct API URL for devnet', () => {
    const config = getConfig('devnet');
    expect(config.API_URL).toBe('http://localhost:18888');
  });

  // --- Block explorer URLs ---

  it('returns correct block explorer URL for mainnet', () => {
    const config = getConfig('mainnet');
    expect(config.BLOCK_EXPLORER_URL_BTC).toBe('https://espo.subfrost.io/mainnet');
  });

  it('returns correct block explorer URL for regtest', () => {
    const config = getConfig('regtest');
    expect(config.BLOCK_EXPLORER_URL_BTC).toBe('https://espo.subfrost.io/regtest');
  });

  it('devnet has empty block explorer URL', () => {
    const config = getConfig('devnet');
    expect(config.BLOCK_EXPLORER_URL_BTC).toBe('');
  });

  // --- frBTC / DIESEL ---

  it('all networks have frBTC as 32:0', () => {
    for (const net of ['mainnet', 'regtest', 'signet', 'devnet']) {
      const config = getConfig(net);
      expect(config.FRBTC_ALKANE_ID).toBe('32:0');
    }
  });

  // --- FIRE protocol IDs ---

  it('all networks have FIRE token IDs', () => {
    for (const net of ['mainnet', 'regtest', 'signet', 'devnet', 'oylnet']) {
      const config = getConfig(net);
      expect(config.FIRE_TOKEN_ID).toBe('4:256');
      expect(config.FIRE_STAKING_ID).toBe('4:257');
      expect(config.FIRE_TREASURY_ID).toBe('4:258');
      expect(config.FIRE_BONDING_ID).toBe('4:259');
      expect(config.FIRE_REDEMPTION_ID).toBe('4:260');
      expect(config.FIRE_DISTRIBUTOR_ID).toBe('4:261');
    }
  });

  // --- Devnet-specific protocol contracts ---

  it('devnet has all protocol contract IDs', () => {
    const config = getConfig('devnet') as any;
    expect(config.FUEL_TOKEN_ID).toBe('4:7000');
    expect(config.FTRBTC_TEMPLATE_ID).toBe('4:7010');
    expect(config.DXBTC_VAULT_ID).toBe('4:7020');
    expect(config.VX_FUEL_GAUGE_ID).toBe('4:7030');
    expect(config.VX_BTCUSD_GAUGE_ID).toBe('4:7031');
    expect(config.SYNTH_POOL_ID).toBe('4:8202');
    expect(config.FRUSD_TOKEN_ID).toBe('4:8201');
    expect(config.FUJIN_FACTORY_ID).toBe('4:7107');
    expect(config.FUJIN_MASTER_ID).toBe('4:7112');
  });

  // --- Default / unknown network ---

  it('unknown network returns default config', () => {
    const config = getConfig('nonexistent-network');
    expect(config.ALKANE_FACTORY_ID).toBe('4:65522');
    expect(config.API_URL).toBe(SUBFROST_API_URLS.mainnet);
    expect(config.BLOCK_EXPLORER_URL_BTC).toBe(BLOCK_EXPLORER_URLS.mainnet);
  });

  // --- SUBFROST_API_URLS map ---

  it('SUBFROST_API_URLS has entries for all key networks', () => {
    expect(SUBFROST_API_URLS.mainnet).toBeDefined();
    expect(SUBFROST_API_URLS.regtest).toBeDefined();
    expect(SUBFROST_API_URLS.signet).toBeDefined();
    expect(SUBFROST_API_URLS.devnet).toBeDefined();
  });

  // --- BLOCK_EXPLORER_URLS map ---

  it('BLOCK_EXPLORER_URLS has entries for all key networks', () => {
    expect(BLOCK_EXPLORER_URLS.mainnet).toBeDefined();
    expect(BLOCK_EXPLORER_URLS.regtest).toBeDefined();
    expect(BLOCK_EXPLORER_URLS.signet).toBeDefined();
    expect(BLOCK_EXPLORER_URLS.devnet).toBeDefined();
  });

  // --- ETH explorer URLs ---

  it('mainnet has etherscan ETH explorer', () => {
    const config = getConfig('mainnet');
    expect(config.BLOCK_EXPLORER_URL_ETH).toBe('https://etherscan.io');
  });

  it('signet has sepolia ETH explorer', () => {
    const config = getConfig('signet');
    expect(config.BLOCK_EXPLORER_URL_ETH).toBe('https://sepolia.etherscan.io');
  });

  it('regtest has empty ETH explorer', () => {
    const config = getConfig('regtest');
    expect(config.BLOCK_EXPLORER_URL_ETH).toBe('');
  });
});

// ---------------------------------------------------------------------------
// getTxExplorerUrl — user-facing transaction link policy
// ---------------------------------------------------------------------------
describe('getTxExplorerUrl', () => {
  const sampleTxid = 'b9b179ebc676cce55fd6892eb41159ac02cadc4a6124c65e573a9de128b3697d';

  it('mainnet uses public espo.sh domain', () => {
    expect(getTxExplorerUrl('mainnet', sampleTxid)).toBe(`https://espo.sh/tx/${sampleTxid}`);
  });

  it('regtest routes to subfrost-hosted explorer', () => {
    expect(getTxExplorerUrl('regtest', sampleTxid)).toBe(`https://espo.subfrost.io/regtest/tx/${sampleTxid}`);
  });

  it('subfrost-regtest matches regtest', () => {
    expect(getTxExplorerUrl('subfrost-regtest', sampleTxid)).toBe(`https://espo.subfrost.io/regtest/tx/${sampleTxid}`);
  });

  it('testnet routes to subfrost-hosted explorer', () => {
    expect(getTxExplorerUrl('testnet', sampleTxid)).toBe(`https://espo.subfrost.io/testnet/tx/${sampleTxid}`);
  });

  it('signet routes to subfrost-hosted explorer', () => {
    expect(getTxExplorerUrl('signet', sampleTxid)).toBe(`https://espo.subfrost.io/signet/tx/${sampleTxid}`);
  });

  it('oylnet routes to mainnet-flavored subfrost explorer', () => {
    expect(getTxExplorerUrl('oylnet', sampleTxid)).toBe(`https://espo.subfrost.io/mainnet/tx/${sampleTxid}`);
  });

  it('devnet returns null (no public explorer)', () => {
    expect(getTxExplorerUrl('devnet', sampleTxid)).toBeNull();
  });

  it('regtest-local returns null (no public explorer)', () => {
    expect(getTxExplorerUrl('regtest-local', sampleTxid)).toBeNull();
  });

  it('qubitcoin-regtest returns null (no public explorer)', () => {
    expect(getTxExplorerUrl('qubitcoin-regtest', sampleTxid)).toBeNull();
  });

  it('empty txid returns null', () => {
    expect(getTxExplorerUrl('mainnet', '')).toBeNull();
  });

  it('undefined network falls back to mainnet (production-leaning default)', () => {
    expect(getTxExplorerUrl(undefined, sampleTxid)).toBe(`https://espo.sh/tx/${sampleTxid}`);
  });

  it('unknown network falls back to mainnet (production-leaning default)', () => {
    expect(getTxExplorerUrl('unknown-network', sampleTxid)).toBe(`https://espo.sh/tx/${sampleTxid}`);
  });
});
