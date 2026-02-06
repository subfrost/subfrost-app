-- wallet-state.lua: Compute wallet state with confirmed/pending BTC separation
-- Args: address, protocol_tag (optional, default "1")
--
-- Returns:
--   confirmed.total     - sum of all confirmed UTXO values (sats)
--   confirmed.spendable - confirmed UTXOs with no inscriptions/runes
--   confirmed.withAssets - confirmed UTXOs bearing inscriptions or runes
--   confirmed.utxos     - detailed list of confirmed UTXOs
--   pending.total       - sum of all unconfirmed UTXO values (sats)
--   pending.utxos       - detailed list of pending UTXOs
--   height              - metashrew height (for cache-busting)

local address = args[1]

-- Get indexer heights
local ord_height = _RPC.ord_blockheight() or 0
local metashrew_height_str = _RPC.metashrew_height() or "0"
local metashrew_height = tonumber(metashrew_height_str) or 0
local max_indexed_height = math.max(ord_height, metashrew_height)

-- Get UTXOs and ord outputs
local utxos = _RPC.esplora_addressutxo(address) or {}
local ord_outputs = _RPC.ord_outputs(address) or {}

-- Build ord outputs lookup
local ord_map = {}
for _, output in ipairs(ord_outputs) do
    if output.outpoint then
        ord_map[output.outpoint] = {
            inscriptions = output.inscriptions or {},
            ord_runes = output.runes or {}
        }
    end
end

-- Accumulators
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

    -- Attach ord data
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
