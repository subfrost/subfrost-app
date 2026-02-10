/**
 * Lua script loader/executor utilities for wallet state queries.
 *
 * WALLET_STATE_SCRIPT computes confirmed vs pending BTC balances server-side
 * so the frontend doesn't have to sum UTXOs and categorize them.
 */

import { computeScriptHash } from '@/lib/luaScripts';

/**
 * Wallet-state lua script.
 *
 * Takes args[1] = address, returns { confirmed, pending, height }.
 * See lib/lua/wallet-state.lua for the source reference.
 */
export const WALLET_STATE_SCRIPT = `-- wallet-state: confirmed/pending BTC separation
local address = args[1]

local ord_height = _RPC.ord_blockheight() or 0
local metashrew_height_str = _RPC.metashrew_height() or "0"
local metashrew_height = tonumber(metashrew_height_str) or 0
local max_indexed_height = math.max(ord_height, metashrew_height)

local utxos = _RPC.esplora_addressutxo(address) or {}
local ord_outputs = _RPC.ord_outputs(address) or {}

local ord_map = {}
for _, output in ipairs(ord_outputs) do
    if output.outpoint then
        ord_map[output.outpoint] = {
            inscriptions = output.inscriptions or {},
            ord_runes = output.runes or {}
        }
    end
end

local confirmed_total = 0
local confirmed_spendable = 0
local confirmed_with_assets = 0
local confirmed_utxos = {}
local pending_total = 0
local pending_utxos = {}

for _, utxo in ipairs(utxos) do
    local txid = utxo.txid
    local vout = utxo.vout
    local value = utxo.value
    local key = txid .. ":" .. vout

    local height = nil
    if utxo.status and utxo.status.block_height then
        height = utxo.status.block_height
    end

    local entry = {
        outpoint = key,
        value = value
    }
    if height then
        entry.height = height
    end

    if ord_map[key] then
        if #ord_map[key].inscriptions > 0 then
            entry.inscriptions = ord_map[key].inscriptions
        end
        if next(ord_map[key].ord_runes) ~= nil then
            entry.ord_runes = ord_map[key].ord_runes
        end
    end

    local has_assets = (entry.inscriptions and #entry.inscriptions > 0) or
                       (entry.ord_runes and next(entry.ord_runes) ~= nil)

    local is_confirmed = height and height <= max_indexed_height

    if not is_confirmed then
        pending_total = pending_total + value
        table.insert(pending_utxos, entry)
    else
        confirmed_total = confirmed_total + value
        if has_assets then
            confirmed_with_assets = confirmed_with_assets + value
        else
            confirmed_spendable = confirmed_spendable + value
        end
        table.insert(confirmed_utxos, entry)
    end
end

return {
    confirmed = {
        total = confirmed_total,
        spendable = confirmed_spendable,
        withAssets = confirmed_with_assets,
        utxos = confirmed_utxos
    },
    pending = {
        total = pending_total,
        utxos = pending_utxos
    },
    height = metashrew_height
}
`;

export const WALLET_STATE_SCRIPT_HASH = computeScriptHash(WALLET_STATE_SCRIPT);

/** Shape returned by the wallet-state lua script */
export interface WalletStateResult {
  confirmed: {
    total: number;
    spendable: number;
    withAssets: number;
    utxos: Array<{
      outpoint: string;
      value: number;
      height?: number;
      inscriptions?: any[];
      ord_runes?: Record<string, any>;
    }>;
  };
  pending: {
    total: number;
    utxos: Array<{
      outpoint: string;
      value: number;
      height?: number;
    }>;
  };
  height: number;
}
