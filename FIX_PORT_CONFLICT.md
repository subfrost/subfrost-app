# Fix for Port 18443 Conflict

## The Problem

The error shows that port 18443 is already in use:
```
failed to bind host port for 0.0.0.0:18443:172.18.0.2:18443/tcp: address already in use
```

This means you have a Bitcoin regtest node already running locally.

## Solution

### Option 1: Stop the Existing Bitcoin Node (Recommended)

```bash
# Stop the local Bitcoin regtest node
bitcoin-cli -regtest stop

# Wait a few seconds for it to shut down
sleep 5

# Now re-run the setup script
./scripts/setup-regtest.sh
```

### Option 2: Find and Kill the Process

```bash
# Find what's using port 18443
lsof -i :18443

# Kill the process (use the PID from above command)
kill <PID>

# Or kill it directly
sudo lsof -ti:18443 | xargs kill

# Now re-run the setup script
./scripts/setup-regtest.sh
```

### Option 3: Stop All Bitcoin Processes

```bash
# Stop all bitcoind processes
pkill -9 bitcoind

# Wait a moment
sleep 3

# Now re-run the setup script
./scripts/setup-regtest.sh
```

## After Fixing

Once you've stopped the conflicting service, run:

```bash
./scripts/setup-regtest.sh
```

The updated script will now check for port conflicts before starting and offer to fix them automatically!

## Prevention

The docker-compose environment runs its own Bitcoin regtest node, so you don't need a separate local bitcoind running. The setup script handles everything.
