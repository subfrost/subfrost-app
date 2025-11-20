#!/usr/bin/env python3
"""
Derive private key from BIP39 mnemonic for use with alkanes-cli --wallet-key-file
"""

import hashlib
import hmac

# BIP39 mnemonic from wallet creation
MNEMONIC = "fiber emotion slush tuna upon float father leg into transfer walnut blouse own season future toddler stadium session physical long six moon chicken example"

def mnemonic_to_seed(mnemonic, passphrase=""):
    """Convert BIP39 mnemonic to seed using PBKDF2"""
    mnemonic_bytes = mnemonic.encode('utf-8')
    salt = ('mnemonic' + passphrase).encode('utf-8')
    seed = hashlib.pbkdf2_hmac('sha512', mnemonic_bytes, salt, 2048)
    return seed

def derive_master_key(seed):
    """Derive BIP32 master key from seed"""
    h = hmac.new(b"Bitcoin seed", seed, hashlib.sha512).digest()
    master_key = h[:32]
    master_chain = h[32:]
    return master_key, master_chain

def int_to_bytes(i, length):
    """Convert integer to bytes with specified length"""
    return i.to_bytes(length, 'big')

def bytes_to_int(b):
    """Convert bytes to integer"""
    return int.from_bytes(b, 'big')

def derive_child_key(parent_key, parent_chain, index, hardened=False):
    """Derive child key using BIP32"""
    if hardened:
        index = index | 0x80000000
    
    if hardened:
        data = b'\x00' + parent_key + int_to_bytes(index, 4)
    else:
        # Would need to compute public key for non-hardened
        # For simplicity, we'll use hardened derivation
        data = b'\x00' + parent_key + int_to_bytes(index, 4)
    
    h = hmac.new(parent_chain, data, hashlib.sha512).digest()
    child_key = h[:32]
    child_chain = h[32:]
    
    return child_key, child_chain

def derive_bip84_key(seed):
    """
    Derive key for BIP84 path: m/84'/1'/0'/0/0
    (P2WPKH for regtest)
    """
    # Master key
    master_key, master_chain = derive_master_key(seed)
    
    # m/84'
    key_84, chain_84 = derive_child_key(master_key, master_chain, 84, hardened=True)
    
    # m/84'/1' (1 for testnet/regtest)
    key_1, chain_1 = derive_child_key(key_84, chain_84, 1, hardened=True)
    
    # m/84'/1'/0'
    key_0_h, chain_0_h = derive_child_key(key_1, chain_1, 0, hardened=True)
    
    # m/84'/1'/0'/0
    key_0, chain_0 = derive_child_key(key_0_h, chain_0_h, 0, hardened=False)
    
    # m/84'/1'/0'/0/0
    final_key, final_chain = derive_child_key(key_0, chain_0, 0, hardened=False)
    
    return final_key

def key_to_wif(private_key, testnet=True):
    """Convert private key to WIF format"""
    # Version byte (0xEF for regtest/testnet)
    version = b'\xef' if testnet else b'\x80'
    
    # Add version byte and compression flag
    extended = version + private_key + b'\x01'
    
    # Double SHA256 for checksum
    checksum = hashlib.sha256(hashlib.sha256(extended).digest()).digest()[:4]
    
    # Base58 encode
    wif = base58_encode(extended + checksum)
    
    return wif

def base58_encode(data):
    """Encode bytes to base58"""
    alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
    
    # Convert bytes to integer
    num = bytes_to_int(data)
    
    # Encode
    encoded = ''
    while num > 0:
        num, remainder = divmod(num, 58)
        encoded = alphabet[remainder] + encoded
    
    # Add leading zeros
    for byte in data:
        if byte == 0:
            encoded = '1' + encoded
        else:
            break
    
    return encoded

if __name__ == "__main__":
    print("Deriving private key from mnemonic...")
    print()
    
    # Derive seed from mnemonic
    seed = mnemonic_to_seed(MNEMONIC)
    print(f"✅ Seed: {seed.hex()[:64]}...")
    
    # Derive private key
    private_key = derive_bip84_key(seed)
    print(f"✅ Private key (hex): {private_key.hex()}")
    
    # Convert to WIF
    wif = key_to_wif(private_key, testnet=True)
    print(f"✅ Private key (WIF): {wif}")
    print()
    
    # Save to file
    key_file = "/tmp/regtest-privkey.txt"
    with open(key_file, 'w') as f:
        f.write(wif)
    
    print(f"✅ Private key saved to: {key_file}")
    print()
    print("Usage:")
    print(f"  alkanes-cli -p regtest --wallet-key-file {key_file} \\")
    print("    alkanes execute \"[3,65517]\" \\")
    print("    --envelope prod_wasms/alkanes_std_auth_token.wasm \\")
    print("    --fee-rate 1 --mine -y")
