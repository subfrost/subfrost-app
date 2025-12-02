// src/wallet.ts
import * as bip39 from "bip39";
import * as bitcoin from "bitcoinjs-lib";
import { BIP32Factory } from "bip32";
import * as ecc from "tiny-secp256k1";
import { ECPairFactory } from "ecpair";
bitcoin.initEccLib(ecc);
var bip32 = BIP32Factory(ecc);
var ECPair = ECPairFactory(ecc);
var AddressType = /* @__PURE__ */ ((AddressType2) => {
  AddressType2["P2PKH"] = "p2pkh";
  AddressType2["P2WPKH"] = "p2wpkh";
  AddressType2["P2TR"] = "p2tr";
  AddressType2["P2SH_P2WPKH"] = "p2sh-p2wpkh";
  return AddressType2;
})(AddressType || {});
var networkMap = {
  mainnet: bitcoin.networks.bitcoin,
  testnet: bitcoin.networks.testnet,
  signet: bitcoin.networks.testnet,
  regtest: bitcoin.networks.regtest
};
var getHdPath = (addressType, network, change, index) => {
  const coinType = network === bitcoin.networks.bitcoin ? 0 : 1;
  switch (addressType) {
    case "p2tr" /* P2TR */:
      return `m/86'/${coinType}'/0'/${change}/${index}`;
    // BIP86
    case "p2wpkh" /* P2WPKH */:
      return `m/84'/${coinType}'/0'/${change}/${index}`;
    // BIP84
    case "p2sh-p2wpkh" /* P2SH_P2WPKH */:
      return `m/49'/${coinType}'/0'/${change}/${index}`;
    // BIP49
    case "p2pkh" /* P2PKH */:
    default:
      return `m/44'/${coinType}'/0'/${change}/${index}`;
  }
};
var AlkanesWallet = class {
  constructor(config) {
    const mnemonic = config.mnemonic.trim();
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }
    this.seed = bip39.mnemonicToSeedSync(mnemonic);
    if (typeof config.network === "string") {
      this.network = networkMap[config.network] || bitcoin.networks.bitcoin;
    } else if (config.network) {
      this.network = config.network;
    } else {
      this.network = bitcoin.networks.bitcoin;
    }
    this.root = bip32.fromSeed(this.seed, this.network);
  }
  /**
   * Derive an address for a specific address type
   */
  deriveAddress(addressType, change = 0, index = 0) {
    const addrType = typeof addressType === "string" ? addressType : addressType;
    const path = getHdPath(addrType, this.network, change, index);
    const child = this.root.derivePath(path);
    const publicKey = child.publicKey;
    let address;
    switch (addrType) {
      case "p2tr" /* P2TR */: {
        const xOnlyPubKey = publicKey.slice(1, 33);
        const p2tr = bitcoin.payments.p2tr({
          internalPubkey: xOnlyPubKey,
          network: this.network
        });
        address = p2tr.address;
        break;
      }
      case "p2wpkh" /* P2WPKH */: {
        const p2wpkh = bitcoin.payments.p2wpkh({
          pubkey: publicKey,
          network: this.network
        });
        address = p2wpkh.address;
        break;
      }
      case "p2sh-p2wpkh" /* P2SH_P2WPKH */: {
        const p2wpkh = bitcoin.payments.p2wpkh({
          pubkey: publicKey,
          network: this.network
        });
        const p2sh = bitcoin.payments.p2sh({
          redeem: p2wpkh,
          network: this.network
        });
        address = p2sh.address;
        break;
      }
      case "p2pkh" /* P2PKH */:
      default: {
        const p2pkh = bitcoin.payments.p2pkh({
          pubkey: publicKey,
          network: this.network
        });
        address = p2pkh.address;
        break;
      }
    }
    return {
      address,
      publicKey: publicKey.toString("hex"),
      path
    };
  }
  /**
   * Sign a PSBT (base64 encoded)
   */
  async signPsbt(psbtBase64) {
    const psbt = bitcoin.Psbt.fromBase64(psbtBase64, { network: this.network });
    const signers = [];
    for (let i = 0; i < 10; i++) {
      const path = getHdPath("p2wpkh" /* P2WPKH */, this.network, 0, i);
      const child = this.root.derivePath(path);
      signers.push({
        path,
        keyPair: ECPair.fromPrivateKey(child.privateKey, { network: this.network })
      });
    }
    for (let i = 0; i < 10; i++) {
      const path = getHdPath("p2tr" /* P2TR */, this.network, 0, i);
      const child = this.root.derivePath(path);
      signers.push({
        path,
        keyPair: ECPair.fromPrivateKey(child.privateKey, { network: this.network })
      });
    }
    for (let i = 0; i < psbt.inputCount; i++) {
      for (const { keyPair } of signers) {
        try {
          psbt.signInput(i, keyPair);
        } catch {
        }
      }
    }
    for (let i = 0; i < psbt.inputCount; i++) {
      try {
        psbt.finalizeInput(i);
      } catch {
      }
    }
    return psbt.toBase64();
  }
  /**
   * Sign a message using BIP322 or ECDSA
   */
  async signMessage(message, index = 0) {
    const path = getHdPath("p2wpkh" /* P2WPKH */, this.network, 0, index);
    const child = this.root.derivePath(path);
    const keyPair = ECPair.fromPrivateKey(child.privateKey, { network: this.network });
    const messageHash = bitcoin.crypto.sha256(Buffer.from(message));
    const signature = keyPair.sign(messageHash);
    return signature.toString("hex");
  }
};
var KeystoreManager = class {
  /**
   * Validate a BIP39 mnemonic phrase
   */
  validateMnemonic(mnemonic) {
    return bip39.validateMnemonic(mnemonic.trim());
  }
  /**
   * Generate a new mnemonic phrase
   */
  generateMnemonic(wordCount = 12) {
    const strength = wordCount === 24 ? 256 : 128;
    return bip39.generateMnemonic(strength);
  }
  /**
   * Create a keystore object from mnemonic
   */
  createKeystore(mnemonic, options) {
    if (!this.validateMnemonic(mnemonic)) {
      throw new Error("Invalid mnemonic phrase");
    }
    return {
      mnemonic: mnemonic.trim(),
      network: options?.network || "mainnet",
      createdAt: Date.now()
    };
  }
  /**
   * Encrypt a keystore with a password
   */
  async encrypt(mnemonic, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(mnemonic);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1e5,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      data
    );
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    return Buffer.from(result).toString("base64");
  }
  /**
   * Decrypt a keystore with a password
   */
  async decrypt(encryptedKeystore, password) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const data = Buffer.from(encryptedKeystore, "base64");
    const salt = data.slice(0, 16);
    const iv = data.slice(16, 28);
    const encrypted = data.slice(28);
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits", "deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 1e5,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    return decoder.decode(decrypted);
  }
  /**
   * Export keystore to encrypted JSON
   */
  async exportKeystore(keystore, password, options) {
    const encrypted = await this.encrypt(keystore.mnemonic, password);
    const exportedKeystore = {
      version: 1,
      network: keystore.network,
      createdAt: keystore.createdAt,
      encrypted
    };
    return options?.pretty ? JSON.stringify(exportedKeystore, null, 2) : JSON.stringify(exportedKeystore);
  }
  /**
   * Derive address from keystore
   */
  deriveAddress(keystore, path, network) {
    const seed = bip39.mnemonicToSeedSync(keystore.mnemonic);
    const root = bip32.fromSeed(seed, network || bitcoin.networks.bitcoin);
    const child = root.derivePath(path);
    const p2wpkh = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: network || bitcoin.networks.bitcoin
    });
    return {
      address: p2wpkh.address,
      publicKey: child.publicKey.toString("hex")
    };
  }
};
async function createKeystore(password, options) {
  const manager = new KeystoreManager();
  const mnemonic = manager.generateMnemonic(options?.wordCount || 12);
  const keystoreData = manager.createKeystore(mnemonic, options);
  const encryptedKeystore = await manager.exportKeystore(keystoreData, password, { pretty: true });
  return {
    keystore: encryptedKeystore,
    mnemonic
  };
}
async function unlockKeystore(encryptedKeystoreJson, password) {
  const manager = new KeystoreManager();
  const parsed = JSON.parse(encryptedKeystoreJson);
  const mnemonic = await manager.decrypt(parsed.encrypted, password);
  return {
    mnemonic,
    network: parsed.network || "mainnet"
  };
}
function createWalletFromMnemonic(mnemonic, network) {
  return new AlkanesWallet({
    mnemonic,
    network
  });
}
function createWallet(keystore) {
  return new AlkanesWallet({
    mnemonic: keystore.mnemonic,
    network: keystore.network || "mainnet"
  });
}

// src/provider.ts
var AlkanesProvider = class {
  constructor(config) {
    this.url = config.url;
    this.dataApiUrl = config.dataApiUrl || config.url;
    this.network = config.network;
    this.networkType = config.networkType;
    this.projectId = config.projectId;
    this.version = config.version || "v4";
  }
  /**
   * Get balance for an address
   */
  async getBalance(address) {
    const utxos = await this.getUtxos(address);
    return utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
  }
  /**
   * Get UTXOs for an address
   */
  async getUtxos(address) {
    try {
      const response = await fetch(`${this.url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "esplora_address::utxo",
          params: [address]
        })
      });
      const data = await response.json();
      return data.result || [];
    } catch (error) {
      console.error("[AlkanesProvider] Error fetching UTXOs:", error);
      return [];
    }
  }
  /**
   * Get address UTXOs with spend strategy
   */
  async getAddressUtxos(address, spendStrategy) {
    const utxos = await this.getUtxos(address);
    const spendableUtxos = utxos.filter((u) => u.value > 546);
    if (spendStrategy?.utxoSortGreatestToLeast) {
      spendableUtxos.sort((a, b) => b.value - a.value);
    }
    return { utxos, spendableUtxos };
  }
  /**
   * Broadcast a transaction
   */
  async broadcastTx(txHex) {
    const response = await fetch(`${this.url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "esplora_tx",
        params: [txHex]
      })
    });
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error.message || "Broadcast failed");
    }
    return data.result;
  }
  /**
   * Get block height
   */
  async getBlockHeight() {
    const response = await fetch(`${this.url}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "esplora_blocks::tip::height",
        params: []
      })
    });
    const data = await response.json();
    return data.result || 0;
  }
};
function createProvider(config) {
  return new AlkanesProvider(config);
}

// src/wrap.ts
var FRBTC_GENESIS_BLOCK = 32n;
var FRBTC_GENESIS_TX = 0n;
var ALKANES_PROTOCOL_TAG = 1n;
async function wrapBtc(params) {
  const networkType = params.provider.networkType || "regtest";
  const address = params.account.taproot?.address || params.account.nativeSegwit?.address;
  if (!address) {
    throw new Error("No address found in account");
  }
  const wasm = await import("@alkanes/ts-sdk/wasm");
  const provider = new wasm.WebProvider(networkType);
  const psbtBase64 = await provider.wrapBtc(params.wrapAmount, address, params.feeRate);
  const psbtBuffer = Buffer.from(psbtBase64, "base64");
  const psbtHex = psbtBuffer.toString("hex");
  const signResult = await params.signer.signAllInputs({ rawPsbtHex: psbtHex });
  const signedPsbtBase64 = signResult.signedPsbt;
  let txId;
  if (params.provider.pushPsbt) {
    const result = await params.provider.pushPsbt({ psbtBase64: signedPsbtBase64 });
    txId = result.txId;
  } else if (params.provider.broadcastTx) {
    throw new Error("broadcastTx not yet supported - please use pushPsbt");
  } else if (params.provider.esplora?.broadcast) {
    throw new Error("esplora.broadcast not yet supported - please use pushPsbt");
  } else {
    throw new Error("No broadcast method available on provider");
  }
  return {
    txId,
    rawTx: void 0
  };
}
async function unwrapBtc(params) {
  const networkType = params.provider.networkType || "regtest";
  const address = params.account.taproot?.address || params.account.nativeSegwit?.address;
  if (!address) {
    throw new Error("No address found in account");
  }
  const wasm = await import("@alkanes/ts-sdk/wasm");
  const provider = new wasm.WebProvider(networkType);
  const amount = Number(params.unwrapAmount);
  const psbtBase64 = await provider.unwrapBtc(amount, address);
  const psbtBuffer = Buffer.from(psbtBase64, "base64");
  const psbtHex = psbtBuffer.toString("hex");
  const signResult = await params.signer.signAllInputs({ rawPsbtHex: psbtHex });
  const signedPsbtBase64 = signResult.signedPsbt;
  let txId;
  if (params.provider.pushPsbt) {
    const result = await params.provider.pushPsbt({ psbtBase64: signedPsbtBase64 });
    txId = result.txId;
  } else if (params.provider.broadcastTx) {
    throw new Error("broadcastTx not yet supported - please use pushPsbt");
  } else if (params.provider.esplora?.broadcast) {
    throw new Error("esplora.broadcast not yet supported - please use pushPsbt");
  } else {
    throw new Error("No broadcast method available on provider");
  }
  return {
    txId,
    rawTx: void 0
  };
}
async function getSubfrostAddress(network) {
  const wasm = await import("@alkanes/ts-sdk/wasm");
  if (typeof wasm.get_subfrost_address === "function") {
    return await wasm.get_subfrost_address(network);
  }
  const provider = new wasm.WebProvider(network);
  const result = await provider.alkanesSimulate("32:0", JSON.stringify({ opcode: 103 }));
  const parsed = JSON.parse(result);
  return parsed.address || parsed.result || "";
}
async function getPendingUnwraps(network, confirmations = 6) {
  const wasm = await import("@alkanes/ts-sdk/wasm");
  if (typeof wasm.get_pending_unwraps === "function") {
    const resultJson = await wasm.get_pending_unwraps(network, confirmations);
    return JSON.parse(resultJson);
  }
  const provider = new wasm.WebProvider(network);
  const result = await provider.alkanesPendingUnwraps();
  const parsed = JSON.parse(result);
  return (parsed.unwraps || parsed || []).map((u) => ({
    txid: u.txid,
    vout: u.vout,
    amount: u.amount,
    address: u.address,
    fulfilled: u.fulfilled || false
  }));
}
async function getFrBtcTotalSupply(network) {
  const wasm = await import("@alkanes/ts-sdk/wasm");
  if (typeof wasm.get_frbtc_total_supply === "function") {
    const result2 = await wasm.get_frbtc_total_supply(network);
    return BigInt(result2);
  }
  const provider = new wasm.WebProvider(network);
  const result = await provider.alkanesSimulate("32:0", JSON.stringify({ opcode: 100 }));
  const parsed = JSON.parse(result);
  return BigInt(parsed.supply || parsed.result || "0");
}
var wrapBtcLegacy = wrapBtc;

// src/index.ts
import * as amm from "@oyl/sdk/lib/amm";
export {
  ALKANES_PROTOCOL_TAG,
  AddressType,
  AlkanesProvider,
  AlkanesWallet,
  FRBTC_GENESIS_BLOCK,
  FRBTC_GENESIS_TX,
  KeystoreManager,
  amm,
  createKeystore,
  createProvider,
  createWallet,
  createWalletFromMnemonic,
  getFrBtcTotalSupply,
  getPendingUnwraps,
  getSubfrostAddress,
  unlockKeystore,
  unwrapBtc,
  wrapBtc,
  wrapBtcLegacy
};
