# Subfrost Regtest Deployment Guide

## Issue Summary

The `deploy-regtest.sh` script was hanging during wallet creation because `alkanes-cli wallet create` requires interactive passphrase entry, which cannot be automated via stdin piping.

## Solution

The wallet creation has been separated into a one-time manual step.

## Quick Start

### 1. Create Wallet (One-Time Setup)

```bash
cd ~/subfrost-app
./scripts/create-regtest-wallet.sh
```

When prompted:
- Enter passphrase: `testtesttest`
- Confirm passphrase: `testtesttest`

**Save the mnemonic!** It will be displayed after creation.

### 2. Set Environment Variable

```bash
export WALLET_PASSPHRASE='testtesttest'
```

Add this to your `~/.bashrc` or `~/.zshrc` to persist:

```bash
echo "export WALLET_PASSPHRASE='testtesttest'" >> ~/.bashrc
source ~/.bashrc
```

### 3. Run Deployment

```bash
cd ~/subfrost-app
./scripts/deploy-regtest.sh
```

## Verification

After deployment completes, verify contracts are deployed:

```bash
cd ~/alkanes-rs

# Check OYL Factory at [4, 65522] (0xfff2)
./target/release/alkanes-cli -p regtest alkanes getbytecode 4:65522

# Check dxBTC at [4, 7936] (0x1f00)
./target/release/alkanes-cli -p regtest alkanes getbytecode 4:7936

# Check LBTC at [4, 7959] (0x1f17)
./target/release/alkanes-cli -p regtest alkanes getbytecode 4:7959
```

If bytecode is empty (`0x`), the contract was not deployed.

## What Changed in deploy-regtest.sh

1. **Removed automatic wallet creation** - Script now requires pre-existing wallet
2. **Added `--passphrase` flag** - All wallet operations now use `$WALLET_PASSPHRASE`
3. **Clear error messages** - If wallet missing, script provides exact commands to create it

## Troubleshooting

### Wallet not found error

```
[ERROR] Wallet not found at /home/user/.alkanes/regtest-wallet.json
```

**Solution**: Run `./scripts/create-regtest-wallet.sh` first

### Wrong passphrase error

```
Error: Failed to decrypt wallet
```

**Solution**: Delete wallet and recreate, or check `$WALLET_PASSPHRASE` matches

```bash
rm ~/.alkanes/regtest-wallet.json
./scripts/create-regtest-wallet.sh
export WALLET_PASSPHRASE='testtesttest'
```

### Empty bytecode (0x)

```bash
$ alkanes-cli alkanes getbytecode 4:65522
Bytecode: 0x
```

**Cause**: Contract deployment failed or never ran

**Solution**: 
1. Check deploy script output for errors
2. Ensure regtest node is running: `docker ps | grep bitcoind`
3. Check wallet has funds: `alkanes-cli wallet balance`
4. Re-run deployment: `./scripts/deploy-regtest.sh`

### Regtest node not running

```
[ERROR] Cannot connect to regtest node at http://localhost:18888
```

**Solution**: Start the regtest environment

```bash
cd ~/alkanes-rs
docker-compose up -d
```

Wait 10-15 seconds for startup, then retry.

## Manual Wallet Creation (Alternative)

If `create-regtest-wallet.sh` doesn't work, create manually:

```bash
cd ~/alkanes-rs
./target/release/alkanes-cli -p regtest \
  --sandshrew-rpc-url http://localhost:18888 \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  wallet create
```

Enter `testtesttest` as passphrase (twice), then:

```bash
export WALLET_PASSPHRASE='testtesttest'
./scripts/deploy-regtest.sh
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WALLET_PASSPHRASE` | `testtesttest` | Wallet encryption passphrase |
| `ALKANES_DIR` | `$HOME/alkanes-rs` | alkanes-rs repository location |
| `WALLET_FILE` | `~/.alkanes/regtest-wallet.json` | Wallet keystore path |
| `SANDSHREW_RPC` | `http://localhost:18888` | Regtest RPC URL |

## Architecture Notes

### Why Separate Wallet Creation?

The `alkanes-cli wallet create` command uses interactive prompts that cannot be bypassed:
- No `--passphrase` flag for creation (only for usage)
- No `--non-interactive` mode
- Stdin piping (`echo | command`) doesn't work due to TTY requirements

This is by design for security - wallet creation should be deliberate and secure.

### Deployment Pattern

```
[3, tx] + envelope → creates alkane at [4, tx]
```

Examples:
- Deploy to [3, 65522] → Contract lives at [4, 65522]
- Deploy to [3, 7936] → Contract lives at [4, 7936]

### Reserved Ranges

- **Subfrost**: [4, 0x1f00-0x1fff] (7936-8191)
- **OYL AMM**: [4, 65522], [4, 65517], etc.
- **Genesis**: [1, 0], [2, 0], [31, 0], [32, 0]
