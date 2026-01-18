# GCP Debugging Steps for Regtest 500 Error

## Problem
`/v4/subfrost/get-pools` endpoint returning 500 Internal Server Error

## Service to Check
**Namespace**: `regtest-alkanes`
**Service**: `subfrost-rpc` (listening on port 8545)

## Steps to Debug

### 1. Authenticate with GCP
```bash
# Use the service account JSON
gcloud auth activate-service-account --key-file=~/Downloads/crystal-sa.json
gcloud config set project YOUR_PROJECT_ID
```

### 2. Connect to GKE Cluster
```bash
# List clusters
gcloud container clusters list

# Get credentials (replace CLUSTER_NAME and ZONE)
gcloud container clusters get-credentials CLUSTER_NAME --zone=ZONE
```

### 3. Check Pod Health in regtest-alkanes
```bash
# List all pods in regtest-alkanes namespace
kubectl get pods -n regtest-alkanes

# Check subfrost-rpc pod specifically
kubectl get pods -n regtest-alkanes -l app=subfrost-rpc

# Check pod status and events
kubectl describe pod -n regtest-alkanes -l app=subfrost-rpc

# Check pod logs (last 100 lines)
kubectl logs -n regtest-alkanes -l app=subfrost-rpc --tail=100

# Stream logs live
kubectl logs -n regtest-alkanes -l app=subfrost-rpc -f
```

### 4. Check Service Endpoints
```bash
# Verify service exists and has endpoints
kubectl get svc -n regtest-alkanes subfrost-rpc
kubectl get endpoints -n regtest-alkanes subfrost-rpc

# If no endpoints, pod selector might be wrong
kubectl get pods -n regtest-alkanes --show-labels
```

### 5. Check Recent Pod Restarts
```bash
# Check if pod is crash-looping
kubectl get pods -n regtest-alkanes -l app=subfrost-rpc -w

# Check restart count
kubectl get pods -n regtest-alkanes -o wide
```

### 6. Check Application Logs for 500 Error
```bash
# Get logs with timestamps
kubectl logs -n regtest-alkanes -l app=subfrost-rpc --timestamps=true --tail=200 | grep -i error

# Check for specific endpoint errors
kubectl logs -n regtest-alkanes -l app=subfrost-rpc --tail=500 | grep -i "get-pools"

# Check for database errors
kubectl logs -n regtest-alkanes -l app=subfrost-rpc --tail=500 | grep -i "database\|postgres\|sql"
```

### 7. Check OpenResty/nginx Routing
```bash
# Check jsonrpc pod (handles routing)
kubectl get pods -n regtest-alkanes -l app=jsonrpc
kubectl logs -n regtest-alkanes -l app=jsonrpc --tail=100 | grep -i "subfrost"

# Check nginx config
kubectl exec -n regtest-alkanes -it $(kubectl get pod -n regtest-alkanes -l app=jsonrpc -o name) -- cat /etc/nginx/conf.d/default.conf
```

### 8. Test Endpoint Directly from Inside Cluster
```bash
# Exec into a pod
kubectl exec -n regtest-alkanes -it $(kubectl get pod -n regtest-alkanes -l app=jsonrpc -o name) -- /bin/sh

# Inside pod, test subfrost-rpc service
curl -X POST http://subfrost-rpc:8545/get-pools \
  -H 'Content-Type: application/json' \
  -d '{"factoryId":{"block":"4","tx":"65522"}}'

# Test factory RPC call
curl -X POST http://localhost:18888 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_call","params":[{"block":"4","tx":"65522"},[3],[],0],"id":1}'
```

### 9. Check Resource Limits
```bash
# Check if pod is OOMKilled or hitting limits
kubectl describe pod -n regtest-alkanes -l app=subfrost-rpc | grep -A 5 "Limits\|Requests\|Status"

# Check events for resource issues
kubectl get events -n regtest-alkanes --sort-by='.lastTimestamp' | grep subfrost-rpc
```

### 10. Check Persistent Volume Claims (Database)
```bash
# List PVCs in namespace
kubectl get pvc -n regtest-alkanes

# Check if database PVC is bound and healthy
kubectl describe pvc -n regtest-alkanes | grep -A 10 "alkanes-db\|postgres"
```

## Common Issues and Fixes

### Issue 1: subfrost-rpc Pod Not Running
```bash
# Check deployment
kubectl get deployment -n regtest-alkanes subfrost-rpc

# Scale up if scaled down
kubectl scale deployment -n regtest-alkanes subfrost-rpc --replicas=1

# Restart pod
kubectl rollout restart deployment -n regtest-alkanes subfrost-rpc
```

### Issue 2: Database Table Missing
The PoolState table may not exist on regtest. Check logs for:
```
ERROR: relation "pool_state" does not exist
```

**Fix**: The backend should fall back to RPC when DB fails, but may need code fix.

### Issue 3: Factory State Corrupted
From creating accidental pools [2:1] and [2:2], the factory state may be inconsistent.

**Fix**: Full regtest reset recommended (redeploy contracts).

### Issue 4: Service Configuration Wrong
Check environment variables:
```bash
kubectl get deployment -n regtest-alkanes subfrost-rpc -o yaml | grep -A 20 "env:"
```

Should have:
- `DATABASE_URL` or `POSTGRES_*` vars (if using DB)
- `ALKANES_RPC_URL` or similar for indexer connection
- `FACTORY_ID=4:65522`

## CRITICAL SAFETY REMINDERS

1. **NEVER touch mainnet-alkanes or mainnet-bitcoin namespaces**
2. **NEVER modify mainnet PVCs**
3. **NEVER scale down mainnet services**
4. Only work in `regtest-alkanes` namespace
5. Always use `kubectl` with `-n regtest-alkanes` flag

## If You Need to Reset Regtest

```bash
# Delete all pods in regtest (they'll recreate)
kubectl delete pods -n regtest-alkanes --all

# Or delete specific deployment
kubectl delete deployment -n regtest-alkanes subfrost-rpc
kubectl apply -f path/to/subfrost-rpc-deployment.yaml
```
