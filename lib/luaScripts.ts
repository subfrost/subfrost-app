/**
 * Lua script execution utilities for alkanes-rs integration
 * 
 * This module provides helpers to execute embedded Lua scripts with automatic
 * hash-based caching (lua_evalsaved -> lua_evalscript fallback pattern)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

/**
 * Compute SHA-256 hash of script content (matches Rust sha2 crate output)
 */
export function computeScriptHash(content: string): string {
  const bytes = new TextEncoder().encode(content);
  const hash = sha256(bytes);
  return bytesToHex(hash);
}

/**
 * Execute a Lua script with automatic caching fallback
 * 
 * @param rpcClient - The RPC client (provider.bitcoin)
 * @param script - The lua script content
 * @param args - Arguments to pass to the script
 * @returns The result from script execution
 */
export async function executeLuaScript(
  rpcClient: { lua_evalsaved: (hash: string, ...args: any[]) => Promise<any>, lua_evalscript: (script: string, ...args: any[]) => Promise<any> },
  script: string,
  ...args: any[]
): Promise<any> {
  const hash = computeScriptHash(script);
  
  console.log('[executeLuaScript] Script hash:', hash);
  console.log('[executeLuaScript] Args:', args);
  
  try {
    // Try cached version first
    console.log('[executeLuaScript] Trying lua_evalsaved with hash...');
    const result = await rpcClient.lua_evalsaved(hash, ...args);
    console.log('[executeLuaScript] ✅ lua_evalsaved succeeded');
    return result;
  } catch (error) {
    // Cache miss or error, upload full script
    console.log('[executeLuaScript] lua_evalsaved failed, trying lua_evalscript...', error);
    const result = await rpcClient.lua_evalscript(script, ...args);
    console.log('[executeLuaScript] ✅ lua_evalscript succeeded');
    return result;
  }
}

/**
 * Built-in balances.lua script
 * 
 * Fetches comprehensive balance information for an address including:
 * - Spendable UTXOs (no assets, confirmed)
 * - Asset UTXOs (with runes, inscriptions, or ord_runes)
 * - Pending UTXOs (unconfirmed)
 * 
 * Args: address, protocol_tag (optional, default: "1"), asset_address (optional)
 */
export const BALANCES_LUA = `-- Comprehensive balance information for an address (replacement for sandshrew_balances)
-- Args: address, protocol_tag (optional, default: "1"), asset_address (optional)

local address = args[1]
local protocol_tag = args[2] or "1"
local asset_address = args[3]

-- Determine which addresses to query
local addresses = {address}
if asset_address then
    table.insert(addresses, asset_address)
end

-- Remove duplicates
local unique_addresses = {}
local seen = {}
for _, addr in ipairs(addresses) do
    if not seen[addr] then
        seen[addr] = true
        table.insert(unique_addresses, addr)
    end
end

-- Get ord and metashrew heights
local ord_height = _RPC.ord_blockheight() or 0
local metashrew_height_str = _RPC.metashrew_height() or "0"
local metashrew_height = tonumber(metashrew_height_str) or 0
local max_indexed_height = math.max(ord_height, metashrew_height)

-- Collect results for all addresses
local all_spendable = {}
local all_assets = {}
local all_pending = {}

for _, addr in ipairs(unique_addresses) do
    -- Get UTXOs
    local utxos = _RPC.esplora_addressutxo(addr) or {}
    
    -- Get protorunes/alkanes data
    local protorunes = _RPC.alkanes_protorunesbyaddress({
        address = addr,
        protocolTag = protocol_tag
    }) or {}
    
    -- Get ord outputs (inscriptions and runes)
    local ord_outputs = _RPC.ord_outputs(addr) or {}
    
    -- Build lookup maps
    local runes_map = {}
    if protorunes.outpoints then
        for _, outpoint in ipairs(protorunes.outpoints) do
            if outpoint.outpoint and outpoint.runes then
                local txid = outpoint.outpoint.txid
                local vout = outpoint.outpoint.vout
                -- Reverse txid for key (to match esplora format)
                local key = txid .. ":" .. vout
                runes_map[key] = outpoint.runes
            end
        end
    end
    
    local ord_outputs_map = {}
    for _, output in ipairs(ord_outputs) do
        if output.outpoint then
            ord_outputs_map[output.outpoint] = {
                inscriptions = output.inscriptions or {},
                ord_runes = output.runes or {}
            }
        end
    end
    
    -- Process each UTXO
    for _, utxo in ipairs(utxos) do
        local txid = utxo.txid
        local vout = utxo.vout
        local value = utxo.value
        local key = txid .. ":" .. vout
        
        -- Get height if available
        local height = nil
        if utxo.status and utxo.status.block_height then
            height = utxo.status.block_height
        end
        
        -- Build UTXO entry
        local utxo_entry = {
            outpoint = key,
            value = value
        }
        
        if height then
            utxo_entry.height = height
        end
        
        -- Add runes if present
        if runes_map[key] then
            utxo_entry.runes = runes_map[key]
        end
        
        -- Add inscriptions and ord_runes if present
        if ord_outputs_map[key] then
            if #ord_outputs_map[key].inscriptions > 0 then
                utxo_entry.inscriptions = ord_outputs_map[key].inscriptions
            end
            if next(ord_outputs_map[key].ord_runes) ~= nil then
                utxo_entry.ord_runes = ord_outputs_map[key].ord_runes
            end
        end
        
        -- Categorize UTXO
        local has_assets = (utxo_entry.runes and #utxo_entry.runes > 0) or
                          (utxo_entry.inscriptions and #utxo_entry.inscriptions > 0) or
                          (utxo_entry.ord_runes and next(utxo_entry.ord_runes) ~= nil)
        
        local is_confirmed = height and height <= max_indexed_height
        
        if not is_confirmed then
            table.insert(all_pending, utxo_entry)
        elseif has_assets then
            table.insert(all_assets, utxo_entry)
        else
            table.insert(all_spendable, utxo_entry)
        end
    end
end

-- Return result in sandshrew_balances format
return {
    spendable = all_spendable,
    assets = all_assets,
    pending = all_pending,
    ordHeight = ord_height,
    metashrewHeight = metashrew_height
}
`;

/**
 * Pre-computed hash for BALANCES_LUA script
 */
export const BALANCES_LUA_HASH = computeScriptHash(BALANCES_LUA);
