/**
 * DevnetEvmProvider — ethers.js-compatible EVM provider for in-browser bridge testing.
 *
 * Wraps the revm-web-sys WASM module and coordinator-core-wasm to provide a
 * high-level API for deploying contracts, querying balances, and executing
 * EVM transactions entirely in-process (no external RPC).
 *
 * JOURNAL (2026-03-22): Created for devnet bridge integration. This provider
 * is initialized during DevnetContext boot and made available via the devnet
 * state so the UI and tests can interact with the in-process EVM alongside
 * the in-process Bitcoin chain.
 *
 * Usage:
 *   const evmProvider = await DevnetEvmProvider.create();
 *   const { usdtAddress, usdcAddress } = await evmProvider.deployMockTokens();
 *   await evmProvider.seedWallet(userAddr, { usdc: 10000n * 10n ** 6n });
 *   const balance = await evmProvider.getBalance(usdcAddress, userAddr);
 */

// EVM WASM module interface (matches revm_web_sys.d.ts)
interface EvmDevnetInstance {
  fund_account(address: string, wei_hex: string): void;
  deploy(from: string, bytecode_hex: string): string;
  eth_call(to: string, data_hex: string): string;
  eth_send_transaction(from: string, to: string, data_hex: string, value_hex: string): string;
  mine_block(): void;
  get_last_receipt(): string;
  get_block_number(): bigint;
}

interface EvmDevnetModule {
  EvmDevnet: new () => EvmDevnetInstance;
  initSync(wasmBytes: BufferSource): void;
}

// Coordinator core WASM module interface
interface CoordinatorCoreModule {
  parse_bridge_records(data_hex: string): string;
  build_mint_protostone(frusd_block: number, frusd_tx: number, amount: string): string;
  build_burn_and_bridge_protostone(frusd_block: number, frusd_tx: number, eth_address: string): string;
  build_mark_processed_protostone(frusd_block: number, frusd_tx: number, bridge_id: string): string;
  build_withdraw_calldata(amount_wei: string, recipient: string, script: string): string;
  build_auth_message_hash(calldata: string, nonce: bigint, chain_id: bigint, vault_address: string): Uint8Array;
  usdc_to_frusd(usdc_amount: string): string;
  frusd_to_usdc(frusd_amount: string): string;
  apply_protocol_fee(amount: string): string;
  initSync(wasmBytes: BufferSource): void;
}

// ABI encoding helpers (no external deps)
function encodeUint256(value: bigint | number | string): string {
  const v = BigInt(value);
  return v.toString(16).padStart(64, '0');
}

function encodeAddress(addr: string): string {
  return addr.replace('0x', '').toLowerCase().padStart(64, '0');
}

function encodeFunctionCall(selector: string, ...args: string[]): string {
  return '0x' + selector + args.join('');
}

// ERC20 function selectors (keccak256 of function signature, first 4 bytes)
const ERC20_SELECTORS = {
  balanceOf: '70a08231',     // balanceOf(address)
  transfer: 'a9059cbb',     // transfer(address,uint256)
  approve: '095ea7b3',      // approve(address,uint256)
  mint: '40c10f19',          // mint(address,uint256) — MockERC20 only
  totalSupply: '18160ddd',   // totalSupply()
  decimals: '313ce567',      // decimals()
  name: '06fdde03',          // name()
  symbol: '95d89b41',        // symbol()
} as const;

// Well-known deployer address (Hardhat account #0)
const DEFAULT_DEPLOYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

/** Deployed mock token addresses */
export interface MockTokenAddresses {
  usdtAddress: string;
  usdcAddress: string;
}

/**
 * High-level EVM provider for the in-browser devnet.
 *
 * Provides simple methods to deploy contracts, seed wallets, query balances,
 * and transfer tokens on the in-process revm EVM. Integrates with the
 * coordinator-core WASM for bridge operations (decimal conversion, fee
 * calculation, protostone building).
 */
export class DevnetEvmProvider {
  private evm: EvmDevnetInstance;
  private coord: CoordinatorCoreModule | null;
  private deployedTokens: Map<string, { name: string; symbol: string; decimals: number }> = new Map();

  // Forge artifact bytecode cache (loaded from JSON)
  private static artifactCache: Map<string, any> = new Map();

  private constructor(evm: EvmDevnetInstance, coord: CoordinatorCoreModule | null) {
    this.evm = evm;
    this.coord = coord;
  }

  /**
   * Create a DevnetEvmProvider from WASM bytes.
   *
   * In the browser, fetch the WASMs from /wasm/ public dir.
   * In tests (Node.js), read from the fixtures directory.
   */
  static async create(options?: {
    evmWasmBytes?: Uint8Array;
    coordWasmBytes?: Uint8Array;
  }): Promise<DevnetEvmProvider> {
    let evmWasm: Uint8Array;
    let coordWasm: Uint8Array | undefined;

    if (options?.evmWasmBytes) {
      evmWasm = options.evmWasmBytes;
      coordWasm = options.coordWasmBytes;
    } else {
      // Browser: fetch from public dir
      const evmResp = await fetch('/wasm/revm_web_sys_bg.wasm');
      if (!evmResp.ok) throw new Error(`Failed to fetch revm WASM: HTTP ${evmResp.status}`);
      evmWasm = new Uint8Array(await evmResp.arrayBuffer());

      try {
        const coordResp = await fetch('/wasm/coordinator_core_wasm_bg.wasm');
        if (coordResp.ok) {
          coordWasm = new Uint8Array(await coordResp.arrayBuffer());
        }
      } catch {
        console.warn('[DevnetEvmProvider] coordinator-core WASM not available');
      }
    }

    // Initialize revm WASM
    // Dynamic import for browser compatibility (ES module)
    let evmModule: EvmDevnetModule;
    try {
      // In browser, use dynamic import from the public dir
      // @ts-ignore — runtime URL import
      const mod = await import(/* webpackIgnore: true */ '/wasm/revm_web_sys.js');
      mod.initSync(evmWasm);
      evmModule = mod as unknown as EvmDevnetModule;
    } catch {
      // Fallback: try Node.js-style import (tests)
      try {
        const { readFileSync } = await import('fs');
        const { resolve } = await import('path');
        const fixturesDir = resolve(__dirname, '../../__tests__/devnet/fixtures/evm');
        const mod = await import(/* webpackIgnore: true */ `${fixturesDir}/revm_web_sys.js`);
        mod.initSync(evmWasm);
        evmModule = mod as unknown as EvmDevnetModule;
      } catch (e2) {
        throw new Error(`Failed to initialize revm WASM: ${e2}`);
      }
    }

    // Initialize coordinator core WASM (optional — bridge operations only)
    let coordModule: CoordinatorCoreModule | null = null;
    if (coordWasm) {
      try {
        // @ts-ignore
        const mod = await import(/* webpackIgnore: true */ '/wasm/coordinator_core_wasm.js');
        mod.initSync(coordWasm);
        coordModule = mod as unknown as CoordinatorCoreModule;
      } catch {
        try {
          const { resolve } = await import('path');
          const fixturesDir = resolve(__dirname, '../../__tests__/devnet/fixtures/evm');
          const mod = await import(/* webpackIgnore: true */ `${fixturesDir}/coordinator_core_wasm.js`);
          mod.initSync(coordWasm);
          coordModule = mod as unknown as CoordinatorCoreModule;
        } catch {
          console.warn('[DevnetEvmProvider] coordinator-core not available');
        }
      }
    }

    const evm = new evmModule.EvmDevnet();

    // Fund the deployer account
    const provider = new DevnetEvmProvider(evm, coordModule);
    provider.fundAccount(DEFAULT_DEPLOYER, '10000');

    console.log('[DevnetEvmProvider] Initialized (deployer funded with 10,000 ETH)');
    return provider;
  }

  /**
   * Create a DevnetEvmProvider using the test fixtures (Node.js tests only).
   * This avoids fetch() calls and uses direct fs reads.
   */
  static async createForTests(): Promise<DevnetEvmProvider> {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');

    const fixturesDir = resolve(__dirname, '../../__tests__/devnet/fixtures/evm');
    const evmWasm = readFileSync(resolve(fixturesDir, 'revm_web_sys_bg.wasm'));
    const coordWasm = readFileSync(resolve(fixturesDir, 'coordinator_core_wasm_bg.wasm'));

    const evmMod = await import(/* webpackIgnore: true */ `${fixturesDir}/revm_web_sys.js`);
    evmMod.initSync(evmWasm);

    const coordMod = await import(/* webpackIgnore: true */ `${fixturesDir}/coordinator_core_wasm.js`);
    coordMod.initSync(coordWasm);

    const evm = new (evmMod as unknown as EvmDevnetModule).EvmDevnet();
    const provider = new DevnetEvmProvider(evm, coordMod as unknown as CoordinatorCoreModule);
    provider.fundAccount(DEFAULT_DEPLOYER, '10000');

    return provider;
  }

  // =========================================================================
  // Account Management
  // =========================================================================

  /** Fund an account with ETH. */
  fundAccount(address: string, ethAmount: string): void {
    const wei = BigInt(ethAmount) * 10n ** 18n;
    this.evm.fund_account(address, '0x' + wei.toString(16));
  }

  // =========================================================================
  // Contract Deployment
  // =========================================================================

  /**
   * Deploy mock ERC20 tokens (USDT and USDC) for bridge testing.
   *
   * Uses the MockERC20 artifact from the fixtures directory.
   * USDT has 6 decimals (matching real USDT on Ethereum).
   * USDC has 6 decimals (matching real USDC on Ethereum).
   */
  async deployMockTokens(): Promise<MockTokenAddresses> {
    const artifact = await this.loadArtifact('MockERC20');

    // Deploy USDT
    const usdtArgs = this.encodeMockERC20Constructor('Tether USD', 'USDT', 6);
    const usdtAddress = this.deployContract(DEFAULT_DEPLOYER, artifact, usdtArgs);
    this.deployedTokens.set(usdtAddress.toLowerCase(), { name: 'Tether USD', symbol: 'USDT', decimals: 6 });
    console.log('[DevnetEvmProvider] USDT deployed at:', usdtAddress);

    // Deploy USDC
    const usdcArgs = this.encodeMockERC20Constructor('USD Coin', 'USDC', 6);
    const usdcAddress = this.deployContract(DEFAULT_DEPLOYER, artifact, usdcArgs);
    this.deployedTokens.set(usdcAddress.toLowerCase(), { name: 'USD Coin', symbol: 'USDC', decimals: 6 });
    console.log('[DevnetEvmProvider] USDC deployed at:', usdcAddress);

    return { usdtAddress, usdcAddress };
  }

  /**
   * Deploy a single contract from a Forge artifact.
   * Returns the deployed contract address.
   */
  private deployContract(from: string, artifact: any, constructorArgs: string = ''): string {
    let bytecode = artifact.bytecode.object;
    if (!bytecode.startsWith('0x')) bytecode = '0x' + bytecode;
    if (constructorArgs) {
      bytecode += constructorArgs.replace('0x', '');
    }
    return this.evm.deploy(from, bytecode);
  }

  /**
   * Load a Forge artifact JSON.
   * In the browser, fetches from /wasm/artifacts/.
   * In Node.js tests, reads from the fixtures directory.
   */
  private async loadArtifact(name: string): Promise<any> {
    const cached = DevnetEvmProvider.artifactCache.get(name);
    if (cached) return cached;

    let artifact: any;
    try {
      // Browser: fetch from public dir
      const resp = await fetch(`/wasm/artifacts/${name}.json`);
      if (resp.ok) {
        artifact = await resp.json();
      }
    } catch {
      // Ignore — try Node.js path
    }

    if (!artifact) {
      // Node.js: read from fixtures
      const { readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const path = resolve(__dirname, '../../__tests__/devnet/fixtures/evm', `${name}.json`);
      artifact = JSON.parse(readFileSync(path, 'utf-8'));
    }

    DevnetEvmProvider.artifactCache.set(name, artifact);
    return artifact;
  }

  // =========================================================================
  // Wallet Seeding
  // =========================================================================

  /**
   * Seed a wallet with mock ERC20 tokens.
   * Mints the specified amounts directly to the target address.
   *
   * @param address - EVM address (0x-prefixed)
   * @param tokens - Token amounts in their native decimals (e.g., 10000 * 10^6 for 10k USDC)
   */
  async seedWallet(
    address: string,
    tokens: { usdt?: bigint; usdc?: bigint; eth?: bigint },
    tokenAddresses: MockTokenAddresses,
  ): Promise<void> {
    // Seed ETH
    if (tokens.eth && tokens.eth > 0n) {
      this.evm.fund_account(address, '0x' + tokens.eth.toString(16));
      console.log('[DevnetEvmProvider] Seeded %s with %s wei ETH', address, tokens.eth);
    }

    // Seed USDT
    if (tokens.usdt && tokens.usdt > 0n) {
      this.mintERC20(DEFAULT_DEPLOYER, tokenAddresses.usdtAddress, address, tokens.usdt);
      console.log('[DevnetEvmProvider] Seeded %s with %s USDT (raw)', address, tokens.usdt);
    }

    // Seed USDC
    if (tokens.usdc && tokens.usdc > 0n) {
      this.mintERC20(DEFAULT_DEPLOYER, tokenAddresses.usdcAddress, address, tokens.usdc);
      console.log('[DevnetEvmProvider] Seeded %s with %s USDC (raw)', address, tokens.usdc);
    }
  }

  // =========================================================================
  // ERC20 Operations
  // =========================================================================

  /**
   * Get the ERC20 balance of an address.
   *
   * @param token - Token contract address
   * @param address - Holder address
   * @returns Balance in token's native decimals
   */
  getBalance(token: string, address: string): bigint {
    const result = this.call(token, ERC20_SELECTORS.balanceOf, encodeAddress(address));
    return BigInt(result || '0x0');
  }

  /**
   * Transfer ERC20 tokens between addresses.
   *
   * @returns Transaction receipt as JSON string
   */
  transfer(token: string, from: string, to: string, amount: bigint): string {
    return this.send(
      from, token, ERC20_SELECTORS.transfer,
      encodeAddress(to), encodeUint256(amount),
    );
  }

  /**
   * Approve an ERC20 spender.
   *
   * @returns Transaction receipt as JSON string
   */
  approve(token: string, owner: string, spender: string, amount: bigint): string {
    return this.send(
      owner, token, ERC20_SELECTORS.approve,
      encodeAddress(spender), encodeUint256(amount),
    );
  }

  /**
   * Mint ERC20 tokens (requires MockERC20 with public mint).
   */
  private mintERC20(minter: string, token: string, to: string, amount: bigint): void {
    const receipt = this.send(
      minter, token, ERC20_SELECTORS.mint,
      encodeAddress(to), encodeUint256(amount),
    );
    const parsed = JSON.parse(receipt);
    if (!parsed.success) {
      throw new Error(`Mint failed for ${token}: ${JSON.stringify(parsed)}`);
    }
  }

  /**
   * Get total supply of an ERC20 token.
   */
  getTotalSupply(token: string): bigint {
    const result = this.call(token, ERC20_SELECTORS.totalSupply);
    return BigInt(result || '0x0');
  }

  // =========================================================================
  // Low-level EVM calls
  // =========================================================================

  /** Read-only call (no state change). */
  call(to: string, selector: string, ...args: string[]): string {
    const calldata = encodeFunctionCall(selector, ...args);
    return this.evm.eth_call(to, calldata);
  }

  /** State-changing transaction. */
  send(from: string, to: string, selector: string, ...args: string[]): string {
    const calldata = encodeFunctionCall(selector, ...args);
    return this.evm.eth_send_transaction(from, to, calldata, '0x0');
  }

  /** Send with value (ETH transfer). */
  sendWithValue(from: string, to: string, selector: string, value: bigint, ...args: string[]): string {
    const calldata = encodeFunctionCall(selector, ...args);
    return this.evm.eth_send_transaction(from, to, calldata, '0x' + value.toString(16));
  }

  /** Mine a block on the EVM chain. */
  mineBlock(): void {
    this.evm.mine_block();
  }

  /** Get the last transaction receipt. */
  getLastReceipt(): any {
    return JSON.parse(this.evm.get_last_receipt());
  }

  /** Get current block number. */
  getBlockNumber(): bigint {
    return this.evm.get_block_number();
  }

  // =========================================================================
  // Coordinator / Bridge Helpers
  // =========================================================================

  /** Convert USDC amount (6 dec) to frUSD amount (18 dec). */
  usdcToFrusd(usdcAmount: string): string {
    if (!this.coord) throw new Error('Coordinator core not available');
    return this.coord.usdc_to_frusd(usdcAmount);
  }

  /** Convert frUSD amount (18 dec) to USDC amount (6 dec). */
  frusdToUsdc(frusdAmount: string): string {
    if (!this.coord) throw new Error('Coordinator core not available');
    return this.coord.frusd_to_usdc(frusdAmount);
  }

  /** Apply 0.1% protocol fee to an amount. Returns { net, fee }. */
  applyProtocolFee(amount: string): { net: string; fee: string } {
    if (!this.coord) throw new Error('Coordinator core not available');
    return JSON.parse(this.coord.apply_protocol_fee(amount));
  }

  /** Build a mint protostone for frUSD. */
  buildMintProtostone(frusdBlock: number, frusdTx: number, amount: string): string {
    if (!this.coord) throw new Error('Coordinator core not available');
    return this.coord.build_mint_protostone(frusdBlock, frusdTx, amount);
  }

  /** Build a BurnAndBridge protostone for frUSD. */
  buildBurnAndBridgeProtostone(frusdBlock: number, frusdTx: number, ethAddress: string): string {
    if (!this.coord) throw new Error('Coordinator core not available');
    return this.coord.build_burn_and_bridge_protostone(frusdBlock, frusdTx, ethAddress);
  }

  /** Parse bridge records from raw data. */
  parseBridgeRecords(dataHex: string): any[] {
    if (!this.coord) throw new Error('Coordinator core not available');
    return JSON.parse(this.coord.parse_bridge_records(dataHex));
  }

  /** Build withdrawal calldata for the EVM vault. */
  buildWithdrawCalldata(amountWei: string, recipient: string, script: string): string {
    if (!this.coord) throw new Error('Coordinator core not available');
    return this.coord.build_withdraw_calldata(amountWei, recipient, script);
  }

  /** Check if coordinator core is available. */
  get hasCoordinator(): boolean {
    return this.coord !== null;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Encode MockERC20 constructor arguments.
   * MockERC20(string name, string symbol, uint8 decimals)
   */
  private encodeMockERC20Constructor(name: string, symbol: string, decimals: number): string {
    // ABI encoding for (string, string, uint8):
    // offset_name (32) + offset_symbol (32) + decimals (32) + name_len (32) + name_data (32) + symbol_len (32) + symbol_data (32)
    const nameHex = Buffer.from(name, 'utf8').toString('hex').padEnd(64, '0');
    const symbolHex = Buffer.from(symbol, 'utf8').toString('hex').padEnd(64, '0');

    return [
      // Offset to name string (0x60 = 96 bytes from start)
      '0000000000000000000000000000000000000000000000000000000000000060',
      // Offset to symbol string (0xa0 = 160 bytes from start)
      '00000000000000000000000000000000000000000000000000000000000000a0',
      // decimals
      encodeUint256(decimals),
      // name length
      encodeUint256(name.length),
      // name data
      nameHex,
      // symbol length
      encodeUint256(symbol.length),
      // symbol data
      symbolHex,
    ].join('');
  }
}
