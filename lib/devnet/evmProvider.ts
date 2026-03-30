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
      }
    }

    // Dynamic import helper that bypasses Vite's static import analysis.
    // Vite rejects `import('/public/...')` at transform time. Using indirect
    // `new Function` prevents Vite from seeing the import path.
    const dynamicImport = (url: string) =>
      new Function('url', 'return import(url)')(url) as Promise<any>;

    // Initialize revm WASM
    let evmModule: EvmDevnetModule;
    try {
      // In browser, use dynamic import from the public dir
      const mod = await dynamicImport('/wasm/revm_web_sys.js');
      mod.initSync(evmWasm);
      evmModule = mod as unknown as EvmDevnetModule;
    } catch {
      // Fallback: try Node.js-style import (tests)
      try {
        const { resolve } = await import('path');
        const fixturesDir = resolve(__dirname, '../../__tests__/devnet/fixtures/evm');
        const mod = await dynamicImport(`${fixturesDir}/revm_web_sys.js`);
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
        const mod = await dynamicImport('/wasm/coordinator_core_wasm.js');
        mod.initSync(coordWasm);
        coordModule = mod as unknown as CoordinatorCoreModule;
      } catch {
        try {
          const { resolve } = await import('path');
          const fixturesDir = resolve(__dirname, '../../__tests__/devnet/fixtures/evm');
          const mod = await dynamicImport(`${fixturesDir}/coordinator_core_wasm.js`);
          mod.initSync(coordWasm);
          coordModule = mod as unknown as CoordinatorCoreModule;
        } catch {
        }
      }
    }

    const evm = new evmModule.EvmDevnet();

    // Fund the deployer account
    const provider = new DevnetEvmProvider(evm, coordModule);
    provider.fundAccount(DEFAULT_DEPLOYER, '10000');

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

    // Deploy USDC
    const usdcArgs = this.encodeMockERC20Constructor('USD Coin', 'USDC', 6);
    const usdcAddress = this.deployContract(DEFAULT_DEPLOYER, artifact, usdcArgs);
    this.deployedTokens.set(usdcAddress.toLowerCase(), { name: 'USD Coin', symbol: 'USDC', decimals: 6 });

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
    }

    // Seed USDT
    if (tokens.usdt && tokens.usdt > 0n) {
      this.mintERC20(DEFAULT_DEPLOYER, tokenAddresses.usdtAddress, address, tokens.usdt);
    }

    // Seed USDC
    if (tokens.usdc && tokens.usdc > 0n) {
      this.mintERC20(DEFAULT_DEPLOYER, tokenAddresses.usdcAddress, address, tokens.usdc);
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
  // Vault Deployment & Operations
  // =========================================================================

  /**
   * Deploy the USDCVault contract for real bridge operations.
   *
   * The vault holds USDC and processes bridge deposits/withdrawals.
   * In production, withdrawals require FROST-signed auth messages.
   * In devnet, the deployer can call vault functions directly.
   *
   * @param usdcAddress - Address of the USDC ERC20 token
   * @param coordinatorPubKey - BIP340 public key (hex, 64 chars) for auth verification
   * @returns Deployed vault address
   */
  async deployVault(usdcAddress: string, coordinatorPubKey?: string): Promise<string> {
    // Deploy Bip340Ecrec helper first (required by USDCVault)
    const bip340Artifact = await this.loadArtifact('Bip340Ecrec');
    const bip340Address = this.deployContract(DEFAULT_DEPLOYER, bip340Artifact);

    // Deploy USDCVault
    const vaultArtifact = await this.loadArtifact('USDCVault');
    const vaultAddress = this.deployContract(DEFAULT_DEPLOYER, vaultArtifact);

    // Initialize vault: initialize(address _asset, address _bip340, bytes32 _defaultPubKey)
    const pubKeyHex = coordinatorPubKey || '00'.repeat(32);
    const initCalldata = encodeFunctionCall(
      'c0c53b8b', // initialize(address,address,bytes32) — placeholder selector
      encodeAddress(usdcAddress),
      encodeAddress(bip340Address),
      pubKeyHex.padStart(64, '0'),
    );
    this.evm.eth_send_transaction(DEFAULT_DEPLOYER, vaultAddress, initCalldata, '0x0');
    this.evm.mine_block();

    return vaultAddress;
  }

  /**
   * Seed the vault with USDC for bridge liquidity.
   * The coordinator needs USDC in the vault to process BTC→USDC withdrawals.
   */
  async seedVault(vaultAddress: string, usdcAddress: string, amount: bigint): Promise<void> {
    // Approve vault to spend deployer's USDC
    this.approve(usdcAddress, DEFAULT_DEPLOYER, vaultAddress, amount);
    // Deposit USDC into vault
    const depositCalldata = encodeFunctionCall(
      '6e553f65', // deposit(uint256,address)
      encodeUint256(amount),
      encodeAddress(DEFAULT_DEPLOYER),
    );
    this.evm.eth_send_transaction(DEFAULT_DEPLOYER, vaultAddress, depositCalldata, '0x0');
    this.evm.mine_block();
  }

  /**
   * Get the number of unprocessed payment records in the vault.
   */
  getPaymentsLength(vaultAddress: string): bigint {
    // getPaymentsLength() → uint256
    const result = this.call(vaultAddress, '5e0e1284');
    return BigInt(result || '0x0');
  }

  /**
   * Get a payment record by index.
   * Returns { depositor, amount, btcRecipient, processed }.
   */
  getPayment(vaultAddress: string, index: number): {
    depositor: string;
    amount: bigint;
    btcRecipient: string;
    processed: boolean;
  } {
    // getPayment(uint256) → (address, uint256, bytes32, bool)
    const result = this.call(vaultAddress, 'e2e1e8e9', encodeUint256(index));
    const hex = result.replace('0x', '');
    return {
      depositor: '0x' + hex.slice(24, 64),
      amount: BigInt('0x' + hex.slice(64, 128)),
      btcRecipient: hex.slice(128, 192),
      processed: hex.slice(192, 256) !== '0'.repeat(64),
    };
  }

  /**
   * Execute withdrawFromBridge on the vault.
   * In devnet, called directly by deployer. In production, requires FROST auth.
   */
  withdrawFromBridge(
    vaultAddress: string,
    recipient: string,
    amount: bigint,
  ): string {
    // withdrawFromBridge(address,uint256)
    return this.send(
      DEFAULT_DEPLOYER, vaultAddress, 'c8be6b66',
      encodeAddress(recipient), encodeUint256(amount),
    );
  }

  /**
   * Execute depositAndBridge on the vault.
   * User deposits USDC and specifies a BTC recipient for the bridge.
   */
  depositAndBridge(
    vaultAddress: string,
    from: string,
    usdcAddress: string,
    amount: bigint,
    btcRecipient: string,
  ): string {
    // First approve vault to spend USDC
    this.approve(usdcAddress, from, vaultAddress, amount);
    // depositAndBridge(uint256,bytes32)
    const btcRecipientHex = Buffer.from(btcRecipient).toString('hex').padEnd(64, '0');
    return this.send(
      from, vaultAddress, 'a1903d08',
      encodeUint256(amount), btcRecipientHex,
    );
  }

  /** Public read-only eth_call wrapper. */
  ethCall(to: string, calldata: string): string {
    return this.evm.eth_call(to, calldata);
  }

  // =========================================================================
  // Bridge Output Splitter — ETH gas provisioning for cold wallets
  // =========================================================================

  /**
   * Mock USDC/WETH pool for devnet DEX simulation.
   * In production, this routes through Uniswap V3 SwapRouter.
   *
   * The pool uses a constant-product formula (x*y=k) with:
   * - 10M USDC initial liquidity
   * - 3,000 WETH initial liquidity (~$3,333/ETH for mock)
   */
  private mockPoolState = {
    usdcReserve: 10_000_000n * 10n ** 6n,   // 10M USDC (6 dec)
    wethReserve: 3_000n * 10n ** 18n,         // 3,000 WETH (18 dec)
  };

  /**
   * Quote how much ETH the user would receive for a given USDC amount.
   * Uses constant-product formula with 0.3% fee (matching Uniswap V2).
   */
  quoteUsdcToEth(usdcAmount: bigint): { ethAmount: bigint; priceImpact: number } {
    const { usdcReserve, wethReserve } = this.mockPoolState;
    // Uniswap V2 formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
    const amountInWithFee = usdcAmount * 997n;
    const numerator = amountInWithFee * wethReserve;
    const denominator = usdcReserve * 1000n + amountInWithFee;
    const ethAmount = numerator / denominator;

    // Price impact: compare effective price vs spot price
    const spotPrice = (wethReserve * 10n ** 6n) / usdcReserve; // ETH per USDC (scaled)
    const effectivePrice = usdcAmount > 0n ? (ethAmount * 10n ** 6n) / usdcAmount : 0n;
    const priceImpact = spotPrice > 0n
      ? Number(spotPrice - effectivePrice) / Number(spotPrice)
      : 0;

    return { ethAmount, priceImpact };
  }

  /**
   * Execute a USDC → ETH swap on the mock DEX.
   * Updates pool reserves (constant product) and returns ETH amount.
   *
   * In devnet: directly adjusts reserves and funds recipient with ETH.
   * In production: would call Uniswap V3 SwapRouter.exactInputSingle().
   */
  swapUsdcToEth(
    usdcAmount: bigint,
    recipient: string,
    minEthOut?: bigint,
  ): { ethReceived: bigint; txHash: string } {
    const { ethAmount } = this.quoteUsdcToEth(usdcAmount);

    if (minEthOut && ethAmount < minEthOut) {
      throw new Error(
        `Slippage: would receive ${ethAmount} ETH but minimum is ${minEthOut}`
      );
    }

    // Update pool reserves
    this.mockPoolState.usdcReserve += usdcAmount;
    this.mockPoolState.wethReserve -= ethAmount;

    // Fund recipient with ETH
    this.evm.fund_account(recipient, '0x' + ethAmount.toString(16));
    this.evm.mine_block();

    const txHash = `0xswap-${Date.now().toString(16)}`;

    return { ethReceived: ethAmount, txHash };
  }

  /**
   * Split bridge output: deliver USDC + ETH to recipient.
   *
   * This is the core function for the "receive ETH with your stables" feature.
   * Called by the coordinator after vault releases USDC.
   *
   * @param recipient - EVM address to receive both tokens
   * @param totalUsdc - Total USDC amount from bridge
   * @param ethSplitBps - Basis points of USDC to swap to ETH (0-10000, e.g., 500 = 5%)
   * @param minEthOut - Minimum ETH to receive (slippage protection)
   * @returns Breakdown of what was delivered
   */
  splitBridgeOutput(
    recipient: string,
    totalUsdc: bigint,
    ethSplitBps: number,
    usdcTokenAddress: string,
    minEthOut?: bigint,
  ): {
    usdcDelivered: bigint;
    ethDelivered: bigint;
    ethPrice: string;
    swapTxHash: string | null;
  } {
    if (ethSplitBps < 0 || ethSplitBps > 5000) {
      throw new Error('ETH split must be 0-5000 bps (0-50%)');
    }

    const usdcForEth = (totalUsdc * BigInt(ethSplitBps)) / 10000n;
    const usdcRemaining = totalUsdc - usdcForEth;

    let ethDelivered = 0n;
    let swapTxHash: string | null = null;

    // Transfer USDC remainder to recipient
    if (usdcRemaining > 0n) {
      this.transfer(usdcTokenAddress, DEFAULT_DEPLOYER, recipient, usdcRemaining);
    }

    // Swap portion to ETH if requested
    if (usdcForEth > 0n) {
      const result = this.swapUsdcToEth(usdcForEth, recipient, minEthOut);
      ethDelivered = result.ethReceived;
      swapTxHash = result.txHash;
    }

    // Compute effective ETH price for display
    const ethPrice = usdcForEth > 0n && ethDelivered > 0n
      ? (Number(usdcForEth) / Number(ethDelivered / 10n ** 12n)).toFixed(2)
      : '0';


    return { usdcDelivered: usdcRemaining, ethDelivered, ethPrice, swapTxHash };
  }

  /**
   * Estimate how much ETH a user would receive for gas provisioning.
   * Used by the UI to show the breakdown before the user confirms.
   */
  estimateEthForGas(totalUsdc: bigint, ethSplitBps: number): {
    usdcKept: bigint;
    ethReceived: bigint;
    ethInUsd: string;
    coversApproxTxs: number;
  } {
    const usdcForEth = (totalUsdc * BigInt(ethSplitBps)) / 10000n;
    const usdcKept = totalUsdc - usdcForEth;
    const { ethAmount } = this.quoteUsdcToEth(usdcForEth);

    // Estimate tx coverage: ~0.001 ETH per tx at ~30 gwei
    const avgTxCostWei = 10n ** 15n; // 0.001 ETH
    const coversApproxTxs = avgTxCostWei > 0n ? Number(ethAmount / avgTxCostWei) : 0;

    // ETH value in USD
    const { usdcReserve, wethReserve } = this.mockPoolState;
    const ethPriceUsdc = Number(usdcReserve) / Number(wethReserve / 10n ** 12n);
    const ethInUsd = (Number(ethAmount) / 1e18 * ethPriceUsdc).toFixed(2);

    return { usdcKept, ethReceived: ethAmount, ethInUsd, coversApproxTxs };
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
