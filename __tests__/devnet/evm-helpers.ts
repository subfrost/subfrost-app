/**
 * EVM Devnet Helpers
 *
 * Loads revm-web-sys WASM and coordinator-core-wasm, provides typed helpers
 * for deploying Solidity contracts and interacting with the in-process EVM.
 *
 * Usage:
 *   const evm = await createEvmDevnet();
 *   const usdc = await evm.deployMockERC20('USDC', 'USDC', 6);
 *   await evm.mint(usdc, userAddr, '1000000000'); // 1000 USDC
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIXTURES = resolve(__dirname, 'fixtures/evm');

// EvmDevnet WASM module interface
interface EvmDevnetModule {
  EvmDevnet: new () => EvmDevnetInstance;
  initSync(wasmBytes: BufferSource): void;
}

interface EvmDevnetInstance {
  fund_account(address: string, wei_hex: string): void;
  deploy(from: string, bytecode_hex: string): string;
  eth_call(to: string, data_hex: string): string;
  eth_send_transaction(from: string, to: string, data_hex: string, value_hex: string): string;
  mine_block(): void;
  get_last_receipt(): string;
  get_block_number(): bigint;
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

let _evmModule: EvmDevnetModule | null = null;
let _coordModule: CoordinatorCoreModule | null = null;

async function loadEvmModule(): Promise<EvmDevnetModule> {
  if (!_evmModule) {
    const mod = await import('./fixtures/evm/revm_web_sys.js');
    const wasmBytes = readFileSync(resolve(FIXTURES, 'revm_web_sys_bg.wasm'));
    mod.initSync(wasmBytes);
    _evmModule = mod as unknown as EvmDevnetModule;
  }
  return _evmModule;
}

async function loadCoordinatorModule(): Promise<CoordinatorCoreModule> {
  if (!_coordModule) {
    const mod = await import('./fixtures/evm/coordinator_core_wasm.js');
    const wasmBytes = readFileSync(resolve(FIXTURES, 'coordinator_core_wasm_bg.wasm'));
    mod.initSync(wasmBytes);
    _coordModule = mod as unknown as CoordinatorCoreModule;
  }
  return _coordModule;
}

// Forge artifact loader
interface ForgeArtifact {
  abi: any[];
  bytecode: { object: string };
  methodIdentifiers: Record<string, string>;
}

function loadArtifact(name: string): ForgeArtifact {
  const path = resolve(FIXTURES, `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Simple ABI encoder (no external deps needed for basic types)
function encodeUint256(value: bigint | number | string): string {
  const v = BigInt(value);
  return v.toString(16).padStart(64, '0');
}

function encodeAddress(addr: string): string {
  return addr.replace('0x', '').padStart(64, '0');
}

function encodeFunctionCall(selector: string, ...args: string[]): string {
  return '0x' + selector + args.join('');
}

/**
 * High-level EVM devnet wrapper with contract deployment and interaction.
 */
export class EvmDevnetWrapper {
  private evm: EvmDevnetInstance;
  private coord: CoordinatorCoreModule;

  // Deployed contract addresses
  public addresses: Record<string, string> = {};

  constructor(evm: EvmDevnetInstance, coord: CoordinatorCoreModule) {
    this.evm = evm;
    this.coord = coord;
  }

  /** Fund an account with ETH */
  fundAccount(address: string, ethAmount: string = '1000'): void {
    const wei = BigInt(ethAmount) * 10n ** 18n;
    this.evm.fund_account(address, '0x' + wei.toString(16));
  }

  /** Deploy a contract from a Forge artifact */
  deployContract(from: string, artifactName: string, constructorArgs: string = ''): string {
    const artifact = loadArtifact(artifactName);
    let bytecode = artifact.bytecode.object;
    if (!bytecode.startsWith('0x')) bytecode = '0x' + bytecode;
    if (constructorArgs) {
      bytecode += constructorArgs.replace('0x', '');
    }
    return this.evm.deploy(from, bytecode);
  }

  /** Call a contract function (read-only) */
  call(to: string, selector: string, ...args: string[]): string {
    const calldata = encodeFunctionCall(selector, ...args);
    return this.evm.eth_call(to, calldata);
  }

  /** Send a transaction to a contract function */
  send(from: string, to: string, selector: string, ...args: string[]): string {
    const calldata = encodeFunctionCall(selector, ...args);
    return this.evm.eth_send_transaction(from, to, calldata, '0x0');
  }

  /** Mine a block */
  mineBlock(): void {
    this.evm.mine_block();
  }

  /** Get last receipt */
  getLastReceipt(): any {
    return JSON.parse(this.evm.get_last_receipt());
  }

  // --- Coordinator core helpers ---

  parseBridgeRecords(dataHex: string): any[] {
    return JSON.parse(this.coord.parse_bridge_records(dataHex));
  }

  buildMintProtostone(frusdBlock: number, frusdTx: number, amount: string): string {
    return this.coord.build_mint_protostone(frusdBlock, frusdTx, amount);
  }

  usdcToFrusd(usdcAmount: string): string {
    return this.coord.usdc_to_frusd(usdcAmount);
  }

  frusdToUsdc(frusdAmount: string): string {
    return this.coord.frusd_to_usdc(frusdAmount);
  }

  applyProtocolFee(amount: string): { net: string; fee: string } {
    return JSON.parse(this.coord.apply_protocol_fee(amount));
  }
}

/**
 * Create an initialized EVM devnet with coordinator core.
 */
export async function createEvmDevnet(): Promise<EvmDevnetWrapper> {
  const evmMod = await loadEvmModule();
  const coordMod = await loadCoordinatorModule();
  const evm = new evmMod.EvmDevnet();
  return new EvmDevnetWrapper(evm, coordMod);
}
