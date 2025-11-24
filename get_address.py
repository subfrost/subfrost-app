import hashlib
import base58

with open('public_key.der', 'rb') as f:
    pub_key = f.read()

# 1. SHA256
sha256_hash = hashlib.sha256(pub_key).digest()

# 2. RIPEMD160
ripemd160 = hashlib.new('ripemd160')
ripemd160.update(sha256_hash)
ripemd160_hash = ripemd160.digest()

# 3. Add version byte for mainnet
version_byte = b'\x6f'
versioned_hash = version_byte + ripemd160_hash

# 4. SHA256
sha256_1 = hashlib.sha256(versioned_hash).digest()

# 5. SHA256
sha256_2 = hashlib.sha256(sha256_1).digest()

# 6. Checksum
checksum = sha256_2[:4]

# 7. Append checksum
final_hash = versioned_hash + checksum

# 8. Base58 encode
address = base58.b58encode(final_hash)

print(address.decode())