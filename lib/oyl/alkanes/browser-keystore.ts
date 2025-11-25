/**
 * Browser-Only Keystore Implementation
 * 
 * Simple keystore using only Web Crypto API - no Node.js dependencies
 * This avoids the "Dynamic require of node:crypto" error
 */

import * as bip39 from 'bip39';

export type BrowserKeystore = {
  mnemonic: string;
  masterFingerprint: string;
  accountXpub: string;
  network: string;
  createdAt: number;
};

export type EncryptedBrowserKeystore = {
  encrypted: string;
  salt: string;
  iv: string;
  iterations: number;
  createdAt: number;
};

const PBKDF2_ITERATIONS = 100000; // Standard for password-based encryption
const SALT_LENGTH = 32;
const IV_LENGTH = 12;

/**
 * Generate a new BIP39 mnemonic
 */
export function generateMnemonic(wordCount: 12 | 15 | 18 | 21 | 24 = 12): string {
  const strength = wordCount === 12 ? 128 :
                   wordCount === 15 ? 160 :
                   wordCount === 18 ? 192 :
                   wordCount === 21 ? 224 : 256;
  
  return bip39.generateMnemonic(strength);
}

/**
 * Validate a mnemonic
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic);
}

/**
 * Create keystore from mnemonic (unencrypted)
 */
export function createBrowserKeystore(
  mnemonic: string,
  network: string = 'mainnet'
): BrowserKeystore {
  if (!validateMnemonic(mnemonic)) {
    throw new Error('Invalid mnemonic phrase');
  }

  return {
    mnemonic,
    masterFingerprint: 'browser', // Simplified for browser-only
    accountXpub: 'xpub_browser', // Simplified for browser-only
    network,
    createdAt: Date.now(),
  };
}

/**
 * Encrypt keystore with password (browser-only)
 */
export async function encryptBrowserKeystore(
  keystore: BrowserKeystore,
  password: string
): Promise<EncryptedBrowserKeystore> {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API not available');
  }

  // Generate salt and IV
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Derive key from password
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Encrypt the mnemonic
  const dataBuffer = encoder.encode(keystore.mnemonic);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  // Convert to hex for storage
  const encryptedArray = new Uint8Array(encryptedBuffer);
  const encrypted = Array.from(encryptedArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const saltHex = Array.from(salt)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const ivHex = Array.from(iv)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    encrypted,
    salt: saltHex,
    iv: ivHex,
    iterations: PBKDF2_ITERATIONS,
    createdAt: keystore.createdAt,
  };
}

/**
 * Decrypt keystore with password (browser-only)
 */
export async function decryptBrowserKeystore(
  encrypted: EncryptedBrowserKeystore,
  password: string,
  network: string = 'mainnet'
): Promise<BrowserKeystore> {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API not available');
  }

  // Parse hex strings back to buffers
  const hexToBytes = (hex: string) => {
    const matches = hex.match(/.{1,2}/g) || [];
    return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
  };

  const salt = hexToBytes(encrypted.salt);
  const iv = hexToBytes(encrypted.iv);
  const encryptedData = hexToBytes(encrypted.encrypted);

  // Derive key from password
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const passwordBuffer = encoder.encode(password);

  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: encrypted.iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Decrypt the data
  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );

    const mnemonic = decoder.decode(decryptedBuffer);

    if (!validateMnemonic(mnemonic)) {
      throw new Error('Decrypted data is not a valid mnemonic');
    }

    return {
      mnemonic,
      masterFingerprint: 'browser',
      accountXpub: 'xpub_browser',
      network,
      createdAt: encrypted.createdAt,
    };
  } catch {
    throw new Error('Decryption failed: incorrect password');
  }
}

/**
 * Serialize encrypted keystore to JSON string
 */
export function serializeEncryptedKeystore(encrypted: EncryptedBrowserKeystore): string {
  return JSON.stringify(encrypted, null, 2);
}

/**
 * Parse encrypted keystore from JSON string
 */
export function parseEncryptedKeystore(json: string): EncryptedBrowserKeystore {
  const parsed = JSON.parse(json);
  if (!parsed.encrypted || !parsed.salt || !parsed.iv) {
    throw new Error('Invalid encrypted keystore format');
  }
  return parsed;
}
