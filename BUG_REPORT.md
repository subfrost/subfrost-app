# Critical Bug in alkanes-cli v10.0.0

## Issue Summary
The wallet passphrase mechanism in alkanes-cli v10.0.0 is broken. The `--passphrase` flag does not properly unlock the wallet for transaction operations, causing all contract deployments to fail.

## Steps to Reproduce

1. Create wallet:
```bash
alkanes-cli -p regtest wallet create
# Enter passphrase: deployment123
# Wallet created successfully
```

2. Fund wallet:
```bash
WALLET_ADDR="bcrt1qzzqmk8mnve5rt0yysq3pj6sqtnxgd8s9ag7l9s"
alkanes-cli -p regtest bitcoind generatetoaddress 101 "$WALLET_ADDR"
```

3. Sync wallet:
```bash
alkanes-cli -p regtest --passphrase "deployment123" wallet sync
# ✅ Wallet synchronized
```

4. Try to deploy contract:
```bash
alkanes-cli -p regtest --passphrase "deployment123" \
  alkanes execute "[3,65517]" \
  --envelope prod_wasms/alkanes_std_auth_token.wasm \
  --fee-rate 1 --mine -y
```

## Expected Behavior
Contract should be deployed successfully using the wallet funds.

## Actual Behavior
```
Error: Wallet error: Wallet must be unlocked to get internal key
```

## Additional Details

- Wallet can read addresses with `--passphrase` flag ✅
- Wallet can sync with `--passphrase` flag ✅
- Wallet balance command fails with "Wallet is not unlocked" ❌
- Wallet send command fails with "Wallet is not unlocked" ❌
- Alkanes execute fails with "Wallet must be unlocked to get internal key" ❌
- Using `--keystore` flag doesn't help ❌
- Using `--wallet-file` flag doesn't help ❌

## Root Cause
The `WalletState` is not being set to `WalletState::Unlocked` even when passphrase is provided. The `unlock_wallet()` function exists in the code but appears not to be called properly before transaction operations.

## Workaround Attempted
- Tried `wallet backup` command → panics with "not implemented"
- Tried `wallet mnemonic` command → panics with "unknown variant"
- No way to export private key for use with `--wallet-key-file`

## Impact
**CRITICAL** - Completely blocks all contract deployment operations. The wallet system is unusable for transactions.

## Environment
- alkanes-cli: v10.0.0
- OS: macOS 24.5.0
- Network: regtest
- Infrastructure: Working (Bitcoin Core + Alkanes indexer running)

## Suggested Fix
Ensure `unlock_wallet(&passphrase)` is called before any transaction-creating operation when `--passphrase` flag is provided.

## Files Affected
- `crates/alkanes-cli-common/src/provider.rs` - Wallet unlock logic
- `crates/alkanes-cli/src/commands.rs` - Command handlers

## Mnemonic for Testing
```
fiber emotion slush tuna upon float father leg into transfer walnut blouse own season future toddler stadium session physical long six moon chicken example
```

Address: `bcrt1qzzqmk8mnve5rt0yysq3pj6sqtnxgd8s9ag7l9s`
Passphrase: `deployment123`
Keystore: `~/.deezel/regtest.keystore.json`
